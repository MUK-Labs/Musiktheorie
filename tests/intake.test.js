import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { validateCatalogue } from '../scripts/validate.mjs';

const sandbox = { module: { exports: {} } };
vm.runInNewContext(readFileSync(new URL('../google-apps-script/Core.gs', import.meta.url), 'utf8'), sandbox);
const core = sandbox.module.exports;
const now = '2026-10-24T13:00:00Z';
const token = `mt_${'a'.repeat(64)}`;
const hash = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.parse(JSON.stringify(value));
const term = id => ({ id, label: { de: id, en: id }, aliases: [] });
const reference = () => ({
  vocab: {
    subjects: [term('harmony')], topics: [], stages: [term('bachelor')],
    difficulties: [term('introductory'), term('unspecified')], languages: [term('de'), term('en')],
    types: [term('exercise')], access: [term('free'), term('unknown')]
  }, institutions: [], maintainers: [], resources: [], collections: []
});
const fields = () => ({
  title: 'Kadenz hören', url: 'https://example.org/exercise', description_de: 'Eine Hörübung.', description_en: '',
  subjects: ['Harmonielehre / Harmony [harmony]'], stages: ['Bachelor [bachelor]'],
  difficulty: 'Grundlagen [introductory]', languages: ['Deutsch [de]'], type: 'Übung [exercise]', access: 'Frei [free]'
});
const invitation = overrides => ({ invitation_id: 'i-example', label: 'Kollegin', code_hash: hash(token), active: 'true', ...overrides });

test('valid individual invitation bypasses human review', () => {
  const result = core.decideSubmission({ ...fields(), invitation_code: token }, [invitation()], hash, reference(), now, 'r-new');
  assert.equal(result.approval, 'Freigegeben');
  assert.equal(result.trusted, true);
  assert.equal(result.invitationId, 'i-example');
  assert.deepEqual(json(result.resource.subjects), ['harmony']);
  assert.equal(result.resource.status, 'published');
  assert.ok(!JSON.stringify(result).includes(token));
  assert.ok(!JSON.stringify(result).includes(hash(token)));
});

test('missing, forged, revoked and expired codes go to public moderation', () => {
  const cases = [
    { code: '', invitations: [invitation()] },
    { code: 'trusted=yes', invitations: [invitation()] },
    { code: token, invitations: [invitation({ active: 'false' })] },
    { code: token, invitations: [invitation({ expires_at: '2026-10-20T00:00:00Z' })] }
  ];
  for (const entry of cases) {
    const result = core.decideSubmission({ ...fields(), invitation_code: entry.code, status: 'approved', role: 'editor', email: 'trusted@example.org' }, entry.invitations, hash, reference(), now, 'r-new');
    assert.equal(result.approval, 'Offen');
    assert.equal(result.trusted, false);
  }
});

test('public correction stays pending and does not mutate the approved record', () => {
  const catalogue = reference();
  const original = core.decideSubmission(fields(), [], hash, catalogue, now, 'r-existing').resource;
  catalogue.resources.push(original);
  const before = JSON.stringify(catalogue);
  const result = core.decideSubmission({ ...fields(), resource_id: 'r-existing', description_de: 'Geänderte Beschreibung' }, [], hash, catalogue, now, 'unused');
  assert.equal(result.approval, 'Offen');
  assert.equal(result.kind, 'correction');
  assert.equal(result.resource.id, 'r-existing');
  assert.equal(JSON.stringify(catalogue), before);
});

test('trusted status never bypasses required data or valid references', () => {
  for (const changes of [
    { url: 'javascript:alert(1)' }, { description_de: '', description_en: '' },
    { subjects: ['invented-category'] }, { resource_id: '../../workflow' }, { languages: [] }
  ]) {
    const result = core.decideSubmission({ ...fields(), ...changes, invitation_code: token }, [invitation()], hash, reference(), now, 'r-new');
    assert.equal(result.approval, 'Fehler');
    assert.ok(result.errors.length);
  }
});

test('public export whitelists fields and excludes private data and drafts', () => {
  const catalogue = reference();
  const resource = core.decideSubmission(fields(), [], hash, catalogue, now, 'r-one').resource;
  catalogue.resources = [resource];
  catalogue.schemaVersion = 1;
  catalogue.meta = { title: 'Musiktheorie', updatedAt: now };
  const tables = core.seedTables(catalogue);
  tables.resources[0].contact = 'PRIVATE_EMAIL';
  tables.resources[0].invitation_code = 'PRIVATE_CODE';
  tables.resources[0].internal_note = 'PRIVATE_NOTE';
  tables.resources.push({ ...tables.resources[0], id: 'r-draft', status: 'Entwurf', title: 'PRIVATE_DRAFT' });
  tables.inbox = [{ secret: 'PRIVATE_INBOX' }];
  tables.invitations = [{ code_hash: 'PRIVATE_HASH' }];
  const output = core.buildPublicCatalogue(tables, now);
  assert.equal(output.resources.length, 1);
  assert.ok(!JSON.stringify(output).includes('PRIVATE_'));
  assert.deepEqual(Object.keys(output).sort(), ['collections', 'institutions', 'maintainers', 'meta', 'resources', 'schemaVersion', 'vocab']);
});

test('collection ordering is numeric, notes are preserved, dangling references block export', () => {
  const catalogue = reference();
  catalogue.resources = ['r-one', 'r-two'].map((id, i) => core.decideSubmission({ ...fields(), url: `https://example.org/${i}` }, [], hash, catalogue, now, id).resource);
  const tables = core.seedTables(catalogue);
  tables.collections = [{ id: 'c-one', title_de: 'Einführung', title_en: 'Introduction', status: 'Freigegeben' }];
  tables.collectionItems = [
    { collection_id: 'c-one', resource_id: 'r-two', position: '20', note_de: 'Danach' },
    { collection_id: 'c-one', resource_id: 'r-one', position: '10', note_de: 'Zuerst' }
  ];
  const output = core.buildPublicCatalogue(tables, now);
  assert.deepEqual(json(output.collections[0].items.map(i => i.resourceId)), ['r-one', 'r-two']);
  assert.equal(output.collections[0].items[0].note.de, 'Zuerst');
  tables.collectionItems[0].resource_id = 'r-missing';
  assert.throws(() => core.buildPublicCatalogue(tables, now), /nicht veröffentlichte Ressource/);
});

test('untrusted spreadsheet cells are literal text, not formulas', () => {
  for (const value of ['=IMPORTXML("https://example.org")', '+1+1', '@SUM(1)', '  =1+1']) {
    assert.equal(core.literalCell(value), `'${value}`);
  }
  assert.equal(core.literalCell('https://example.org/'), 'https://example.org/');
});

test('the actual starter catalogue survives a Sheets round trip and satisfies the public validator', () => {
  const source = JSON.parse(readFileSync(new URL('../data/catalogue.json', import.meta.url), 'utf8'));
  const output = json(core.buildPublicCatalogue(core.seedTables(source), now));
  assert.deepEqual(validateCatalogue(output), []);
  assert.deepEqual(output.resources, source.resources);
  assert.deepEqual(output.collections, source.collections);
  assert.equal(output.meta.source, 'google-sheets');
});

test('subject/topic IDs are distinct and category ancestors cannot form cycles', () => {
  const tables = core.seedTables(reference());
  tables.vocabulary.push({ facet: 'topics', id: 'harmony', label_de: 'Konflikt', label_en: 'Conflict' });
  assert.throws(() => core.buildPublicCatalogue(tables, now), /doppelte ID/);
  tables.vocabulary.at(-1).id = 'harmony:cadence';
  tables.vocabulary.at(-1).parent_id = 'harmony';
  assert.doesNotThrow(() => core.buildPublicCatalogue(tables, now));
  tables.vocabulary.find(row => row.id === 'harmony').parent_id = 'harmony:cadence';
  assert.throws(() => core.buildPublicCatalogue(tables, now), /Kreis/);
});

test('Google scripts parse as JavaScript without requiring live Google services', () => {
  assert.doesNotThrow(() => new vm.Script(readFileSync(new URL('../google-apps-script/Code.gs', import.meta.url), 'utf8')));
});

test('setup grows a new inbox beyond 26 columns and does not replace existing headers', () => {
  const context = {};
  vm.runInNewContext(readFileSync(new URL('../google-apps-script/Code.gs', import.meta.url), 'utf8'), context);
  let columns = 26, lastRow = 0, headerWrites = 0;
  const range = {
    setValues() { lastRow = 1; headerWrites++; return this; },
    setBackground() { return this; }, setFontColor() { return this; },
    setFontWeight() { return this; }, setNotes() { return this; }
  };
  const sheet = {
    getMaxColumns: () => columns, getLastRow: () => lastRow,
    insertColumnsAfter(_after, count) { columns += count; },
    getRange(_row, _column, _rows, count) { assert.ok(count <= columns); return range; },
    setFrozenRows() {}, setColumnWidths() {}
  };
  const book = { getSheetByName: () => sheet };
  context.mtEnsureSheet_(book, 'inbox');
  assert.equal(columns, context.MT_TABLES.inbox.columns.length);
  context.mtEnsureSheet_(book, 'inbox');
  assert.equal(headerWrites, 1);
});
