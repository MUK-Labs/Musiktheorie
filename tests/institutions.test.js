import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const coreSource = readFileSync(new URL('../google-apps-script/Core.gs', import.meta.url), 'utf8');
const codeSource = readFileSync(new URL('../google-apps-script/Code.gs', import.meta.url), 'utf8');
const coreContext = vm.createContext({});
vm.runInContext(coreSource, coreContext);
const core = coreContext.CatalogueCore;
const copy = value => JSON.parse(JSON.stringify(value));
const now = '2026-10-24T13:00:00Z';
const invitationCode = `mt_${'a'.repeat(64)}`;
const hash = value => createHash('sha256').update(value).digest('hex');
const term = id => ({ id, label: { de: id, en: id }, aliases: [] });
const institution = (patch = {}) => ({
  id: 'inst-existing', name: { de: 'Musikakademie Beispiel', en: 'Example Music Academy' },
  shortName: 'EMA', url: 'https://existing.example.org/', aliases: ['Beispielakademie'], ...patch,
});
const catalogue = (institutions = []) => ({
  schemaVersion: 1,
  meta: { title: 'Test catalogue', updatedAt: now, source: 'test' },
  vocab: {
    subjects: [term('harmony')], topics: [], stages: [term('bachelor')],
    difficulties: [term('introductory'), term('unspecified')], languages: [term('de'), term('en')],
    types: [term('exercise')], access: [term('free'), term('unknown')],
  },
  institutions, maintainers: [], resources: [], collections: [],
});
const fields = (patch = {}) => ({
  title: 'Eine Hörübung', url: 'https://resource.example.org/exercise',
  description_de: 'Eine Beschreibung der Übung.', description_en: '',
  subjects: ['Harmony [harmony]'], stages: ['Bachelor [bachelor]'],
  difficulty: 'Introductory [introductory]', languages: ['Deutsch [de]'],
  type: 'Exercise [exercise]', access: 'Free [free]',
  new_institution_name: 'Neue Musikakademie', new_institution_url: 'https://new.example.org/',
  ...patch,
});

test('an omitted new institution is a no-op, while a website alone is an error', () => {
  const omitted = core.resolveInstitution('', '', [], '');
  assert.equal(omitted.id, '');
  assert.equal(omitted.create, false);
  assert.equal(omitted.institution, null);
  assert.deepEqual(copy(omitted.errors), []);
  const withoutName = core.resolveInstitution('', 'https://example.org/', [], 'inst-reserved');
  assert.ok(withoutName.errors.length);
  assert.equal(withoutName.create, false);
});

test('exact normalized names, translated names, short names and aliases reuse one institution', () => {
  const existing = institution();
  const before = copy(existing);
  for (const name of [
    ' musikakademie   beispiel ', 'EXAMPLE MUSIC ACADEMY', 'ＥＭＡ', 'beispielakademie',
  ]) {
    const result = core.resolveInstitution(name, 'https://different.example.org/', [existing], 'inst-unused');
    assert.deepEqual(copy(result.errors), []);
    assert.equal(result.id, existing.id);
    assert.equal(result.create, false);
    assert.deepEqual(copy(result.institution), before);
  }
  assert.deepEqual(existing, before, 'matching must not change registry metadata');
});

test('institution matching is exact rather than substring based and rejects ambiguous aliases', () => {
  const existing = institution();
  const distinct = core.resolveInstitution('Music Academy', '', [existing], 'inst-distinct');
  assert.equal(distinct.create, true);
  assert.equal(distinct.id, 'inst-distinct');
  const ambiguous = core.resolveInstitution('EMA', '', [existing, institution({ id: 'inst-other' })], 'inst-unused');
  assert.ok(ambiguous.errors.length);
  assert.equal(ambiguous.create, false);
  assert.equal(ambiguous.id, '');
});

test('a new institution uses its reserved ID, literal name and normalized optional website', () => {
  const result = core.resolveInstitution('Neue Akademie', 'www.example.org/academy', [], 'inst-reserved');
  assert.deepEqual(copy(result.errors), []);
  assert.equal(result.create, true);
  assert.deepEqual(copy(result.institution), {
    id: 'inst-reserved', name: { de: 'Neue Akademie', en: 'Neue Akademie' },
    shortName: '', url: 'https://www.example.org/academy', aliases: [],
  });
  assert.equal(core.resolveInstitution('Neue Akademie', '', [], 'inst-reserved').institution.url, '');
});

test('invalid institution proposals cannot allocate a public registry entry', () => {
  const cases = [
    ['X'.repeat(501), '', [], 'inst-reserved'],
    ['Neue Akademie', 'javascript:alert(1)', [], 'inst-reserved'],
    ['Neue Akademie', 'https://user:secret@example.org/', [], 'inst-reserved'],
    ['Neue Akademie', '', [], ''],
    ['Neue Akademie', '', [], '../invalid'],
    ['Neue Akademie', '', [institution()], 'inst-existing'],
  ];
  for (const args of cases) {
    const result = core.resolveInstitution(...args);
    assert.ok(result.errors.length, `Expected a rejected proposal: ${args[0].slice(0, 30)}`);
    assert.equal(result.create, false);
  }
  assert.equal(core.resolveInstitution('X'.repeat(500), '', [], 'inst-reserved').errors.length, 0);
});

// Only the persistence boundary is mocked: decisions, institutional resolution,
// candidate validation and public serialization use the actual Apps Script code.
function harness(initialCatalogue = catalogue()) {
  const context = vm.createContext({});
  vm.runInContext(coreSource, context);
  vm.runInContext(codeSource, context);
  const tables = {
    ...copy(context.CatalogueCore.seedTables(initialCatalogue)),
    inbox: [], settings: [], invitations: [{
      invitation_id: 'i-trusted', label: 'Trusted colleague', code_hash: hash(invitationCode),
      active: 'true', created_at: now, expires_at: '', last_used_at: '', use_count: '0',
    }],
  };
  const fieldIds = Object.fromEntries(context.mtFormDefinitions_(initialCatalogue).map((def, index) => [def.key, index + 100]));
  const properties = {
    CATALOGUE_FORM_ID: 'test-form', FORM_FIELD_IDS: JSON.stringify(fieldIds),
  };
  const propertyApi = {
    getProperty: key => properties[key] ?? null,
    setProperty(key, value) { properties[key] = String(value); return propertyApi; },
    deleteProperty(key) { delete properties[key]; return propertyApi; },
  };
  const writes = [];
  let nextId = 0, publications = 0, failAfterResourceWrite = false, failBeforeInstitutionWrite = false, locked = false;
  const lock = {
    waitLock() { locked = true; }, tryLock() { locked = true; return true; },
    hasLock: () => locked, releaseLock() { locked = false; },
  };
  context.LockService = { getScriptLock: () => lock };
  context.SpreadsheetApp = { flush() {} };
  context.mtProps_ = () => propertyApi;
  context.mtNow_ = () => now;
  context.mtId_ = prefix => `${prefix}allocated-${++nextId}`;
  context.mtHash_ = hash;
  context.mtRead_ = key => tables[key].map((row, index) => ({ ...copy(row), _row: index + 2 }));
  context.mtWrite_ = (key, row, rowNumber) => {
    if (key === 'institutions' && failBeforeInstitutionWrite) {
      failBeforeInstitutionWrite = false;
      throw new Error('SIMULATED_FAILURE_BEFORE_INSTITUTION_WRITE');
    }
    const position = rowNumber ? rowNumber - 2 : tables[key].length;
    const stored = Object.fromEntries(context.MT_TABLES[key].columns.map(([field]) => [field,
      row[field] === null || row[field] === undefined ? '' : String(row[field]),
    ]));
    tables[key][position] = stored;
    writes.push({ key, row: copy(stored) });
    if (key === 'resources' && failAfterResourceWrite) {
      failAfterResourceWrite = false;
      throw new Error('SIMULATED_FAILURE_AFTER_RESOURCE_WRITE');
    }
    return position + 2;
  };
  context.mtSnapshot_ = () => context.CatalogueCore.buildPublicCatalogue(tables, now);
  context.mtSetting_ = () => {};
  context.mtTryPublish_ = () => { publications++; };
  function event(id, submissionFields) {
    return {
      source: { getId: () => 'test-form' },
      response: {
        getId: () => id,
        getItemResponses: () => Object.entries(submissionFields).filter(([key]) => key in fieldIds).map(([key, value]) => ({
          getItem: () => ({ getId: () => fieldIds[key] }), getResponse: () => value,
        })),
      },
    };
  }
  return {
    context, tables, properties, writes, fieldIds,
    submit: (id, submissionFields) => context.catalogueOnFormSubmit(event(id, submissionFields)),
    accept(index = 0) {
      lock.waitLock();
      try { return context.mtAcceptInbox_(context.mtRead_('inbox')[index], index + 2); }
      finally { lock.releaseLock(); }
    },
    snapshot: () => copy(context.mtSnapshot_()),
    failNextResourceWrite() { failAfterResourceWrite = true; },
    failNextInstitutionWrite() { failBeforeInstitutionWrite = true; },
    publicationCount: () => publications,
  };
}

test('public new-institution proposals remain private and repeat submissions keep the reserved ID', () => {
  const h = harness();
  const submission = fields({ contact: 'PRIVATE_CONTACT', internal_note: 'PRIVATE_NOTE' });
  h.submit('response-public', submission);
  assert.equal(h.tables.inbox.length, 1);
  assert.equal(h.tables.inbox[0].decision, 'Offen');
  assert.equal(h.tables.inbox[0].new_institution_name, 'Neue Musikakademie');
  const reservedId = h.tables.inbox[0].new_institution_id;
  assert.ok(reservedId);
  assert.equal(h.tables.institutions.length, 0);
  assert.equal(h.tables.resources.length, 0);
  assert.equal(h.publicationCount(), 0);
  const output = JSON.stringify(h.snapshot());
  for (const privateValue of ['Neue Musikakademie', 'PRIVATE_CONTACT', 'PRIVATE_NOTE', 'new_institution_']) {
    assert.ok(!output.includes(privateValue));
  }
  h.submit('response-public', submission);
  assert.equal(h.tables.inbox.length, 1);
  assert.equal(h.tables.inbox[0].new_institution_id, reservedId);
  assert.ok(!('new_institution_id' in h.fieldIds), 'the reserved ID must never be a respondent-editable question');
});

test('trusted new-institution submissions create and link without a human approval step', () => {
  const h = harness();
  h.submit('response-trusted', fields({ invitation_code: invitationCode }));
  assert.equal(h.tables.inbox[0].decision, 'Übernommen');
  assert.equal(h.tables.institutions.length, 1);
  assert.equal(h.tables.resources.length, 1);
  const output = h.snapshot();
  assert.deepEqual(output.resources[0].institutionIds, [output.institutions[0].id]);
  assert.equal(output.institutions[0].name.de, 'Neue Musikakademie');
  assert.equal(h.publicationCount(), 1);
  assert.equal(h.properties.FORM_CHOICES_PENDING, 'true');
  assert.ok(!JSON.stringify(output).includes('new_institution_'));
  assert.ok(!JSON.stringify(output).includes(invitationCode));
  assert.ok(!JSON.stringify(output).includes(hash(invitationCode)));
  const registryWrite = h.writes.findIndex(write => write.key === 'institutions');
  assert.ok(h.writes.slice(0, registryWrite).some(write => write.key === 'inbox' && write.row.decision === 'Freigegeben'));
});

test('invalid resource or institution data cannot create an institution even for trusted submissions', () => {
  for (const patch of [
    { description_de: '', description_en: '' },
    { new_institution_url: 'javascript:alert(1)' },
    { new_institution_name: '' },
  ]) {
    const h = harness();
    h.submit('response-invalid', fields({ invitation_code: invitationCode, ...patch }));
    assert.equal(h.tables.inbox[0].decision, 'Fehler');
    assert.equal(h.tables.institutions.length, 0);
    assert.equal(h.tables.resources.length, 0);
    assert.equal(h.publicationCount(), 0);
  }
});

test('an existing alias is reused without metadata changes or duplicate resource links', () => {
  const existing = institution();
  const h = harness(catalogue([existing]));
  const before = copy(h.tables.institutions);
  h.submit('response-alias', fields({
    invitation_code: invitationCode, institution_ids: ['Example [inst-existing]'],
    new_institution_name: 'BEISPIELAKADEMIE', new_institution_url: 'https://replacement.example.org/',
  }));
  assert.equal(h.tables.inbox[0].decision, 'Übernommen');
  assert.deepEqual(h.tables.institutions, before);
  assert.deepEqual(h.snapshot().resources[0].institutionIds, ['inst-existing']);
  assert.equal(h.writes.filter(write => write.key === 'institutions').length, 0);
});

test('public approval resolves against the latest registry rather than creating a duplicate', () => {
  const h = harness();
  h.submit('response-pending', fields());
  const pendingId = h.tables.inbox[0].new_institution_id;
  h.submit('response-earlier-acceptance', fields({
    invitation_code: invitationCode, title: 'Eine zweite Übung', url: 'https://resource.example.org/other',
  }));
  const actualId = h.snapshot().institutions[0].id;
  assert.notEqual(pendingId, actualId);
  assert.equal(h.accept(0), true);
  const output = h.snapshot();
  assert.equal(output.institutions.length, 1);
  assert.equal(output.resources.length, 2);
  assert.ok(output.resources.every(resource => resource.institutionIds.length === 1 && resource.institutionIds[0] === actualId));
});

test('a retry after a resource write resumes the same response without duplicate institutions or resources', () => {
  const h = harness();
  const submission = fields({ invitation_code: invitationCode });
  h.failNextResourceWrite();
  assert.throws(() => h.submit('response-retry', submission), /SIMULATED_FAILURE_AFTER_RESOURCE_WRITE/);
  assert.equal(h.tables.institutions.length, 1);
  assert.equal(h.tables.resources.length, 1);
  assert.equal(h.tables.inbox[0].decision, 'Freigegeben');
  assert.equal(h.properties.FORM_CHOICES_PENDING, 'true');
  const firstId = h.tables.institutions[0].id;
  h.submit('response-retry', submission);
  assert.equal(h.tables.inbox.length, 1);
  assert.equal(h.tables.inbox[0].decision, 'Übernommen');
  assert.equal(h.tables.institutions.length, 1);
  assert.equal(h.tables.resources.length, 1);
  assert.equal(h.tables.institutions[0].id, firstId);
  assert.equal(h.publicationCount(), 1);
});

test('a retry replaces an unwritten provisional institution ID when another response created the same name', () => {
  const h = harness();
  const submission = fields({ invitation_code: invitationCode });
  h.failNextInstitutionWrite();
  assert.throws(() => h.submit('response-before-registry', submission), /SIMULATED_FAILURE_BEFORE_INSTITUTION_WRITE/);
  assert.equal(h.tables.institutions.length, 0);
  assert.equal(h.tables.resources.length, 0);
  assert.equal(h.tables.inbox[0].decision, 'Freigegeben');
  const provisionalId = h.tables.inbox[0].new_institution_id;
  h.submit('response-created-between-retries', fields({
    invitation_code: invitationCode, title: 'Andere Übung', url: 'https://resource.example.org/between-retries',
  }));
  const actualId = h.tables.institutions[0].id;
  assert.notEqual(actualId, provisionalId);
  h.submit('response-before-registry', submission);
  assert.equal(h.tables.inbox[0].decision, 'Übernommen');
  const output = h.snapshot();
  assert.equal(output.institutions.length, 1);
  assert.equal(output.resources.length, 2);
  assert.ok(output.resources.every(resource => resource.institutionIds.length === 1 && resource.institutionIds[0] === actualId));
});

test('an invitation-use write failure leaves publication retryable without accepting or counting again', () => {
  const h = harness();
  const submission = fields({ invitation_code: invitationCode });
  const originalWrite = h.context.mtWrite_;
  h.context.mtWrite_ = (key, row, rowNumber) => {
    if (key === 'inbox' && row.decision === 'Übernommen') {
      assert.equal(h.properties.PUBLICATION_PENDING, 'true', 'publication must be pending before completion is persisted');
    }
    if (key === 'invitations') throw new Error('SIMULATED_INVITATION_USE_WRITE_FAILURE');
    return originalWrite(key, row, rowNumber);
  };
  assert.throws(() => h.submit('response-publish-retry', submission), /SIMULATED_INVITATION_USE_WRITE_FAILURE/);
  assert.equal(h.tables.inbox[0].decision, 'Übernommen');
  assert.equal(h.tables.institutions.length, 1);
  assert.equal(h.tables.resources.length, 1);
  assert.equal(h.properties.PUBLICATION_PENDING, 'true');
  assert.equal(h.publicationCount(), 0);
  const acceptedTables = copy(h.tables);
  const acceptanceWrites = h.writes.length;
  h.context.mtWrite_ = originalWrite;
  const originalPublish = h.context.mtTryPublish_;
  h.context.mtTryPublish_ = () => {
    originalPublish();
    delete h.properties.PUBLICATION_PENDING; // Successful real publication clears this marker.
  };
  h.submit('response-publish-retry', submission);
  assert.equal(h.publicationCount(), 1);
  assert.deepEqual(h.tables, acceptedTables, 'retry must not repeat acceptance or invitation bookkeeping');
  assert.equal(h.writes.length, acceptanceWrites);
  h.submit('response-publish-retry', submission);
  assert.equal(h.publicationCount(), 1, 'a completed publication must not be repeated for the same response');
  assert.deepEqual(h.tables, acceptedTables);
});

test('a conflicting resource encountered on retry is not overwritten', () => {
  const h = harness();
  const submission = fields({ invitation_code: invitationCode });
  h.failNextResourceWrite();
  assert.throws(() => h.submit('response-conflict', submission), /SIMULATED_FAILURE_AFTER_RESOURCE_WRITE/);
  h.tables.resources[0].description_de = 'A later editorial change must survive.';
  const before = copy(h.tables.resources[0]);
  h.submit('response-conflict', submission);
  assert.deepEqual(h.tables.resources[0], before);
  assert.equal(h.tables.inbox[0].decision, 'Fehler');
  assert.equal(h.tables.institutions.length, 1);
  assert.equal(h.publicationCount(), 0);
});
