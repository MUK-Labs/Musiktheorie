import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { validateCatalogue } from '../scripts/validate.mjs';

// Apps Script has no browser URL global. Exercise the pure rules in that same constraint.
const sandbox = { module: { exports: {} } };
vm.runInNewContext(readFileSync(new URL('../google-apps-script/Core.gs', import.meta.url), 'utf8'), sandbox);
const core = sandbox.module.exports;
const source = JSON.parse(readFileSync(new URL('../data/catalogue.json', import.meta.url), 'utf8'));
const now = '2026-10-24T18:00:00Z';
const json = value => JSON.parse(JSON.stringify(value));
const reference = () => ({ ...source, resources: [], collections: [] });
const fields = () => ({
  ...json(core.rowFromResource(source.resources[0])),
  url: 'google.com', source_urls: '', description_de: 'Eine Beschreibung.', description_en: '',
  parent_id: '', institution_ids: '', maintainer_ids: ''
});
const submit = changes => core.decideSubmission({ ...fields(), ...changes }, [], () => '', reference(), now, 'r-url-test');

test('literal HTTP Google URL passes; a bare domain requires boundary normalization', () => {
  assert.equal(core.validUrl('http://google.com'), true);
  assert.equal(core.validUrl('google.com'), false);
  const result = submit({});
  assert.equal(result.resource.url, 'https://google.com');
  assert.equal(result.approval, 'Offen');
  assert.deepEqual(json(result.errors), []);
});

test('plausible bare domains receive HTTPS while explicit HTTP and path casing are preserved', () => {
  for (const [input, output] of [
    ['www.example.org/Exercises?lang=de#Step1', 'https://www.example.org/Exercises?lang=de#Step1'],
    ['music.example.ac.at:8443/lesson', 'https://music.example.ac.at:8443/lesson'],
    ['xn--bcher-kva.de', 'https://xn--bcher-kva.de'],
    ['HTTP://Example.org/CaseSensitive', 'http://Example.org/CaseSensitive'],
    ['HTTPS://example.org', 'https://example.org'],
    ['http://example.org', 'http://example.org'],
    [' https://example.org/ ', 'https://example.org/'],
    ['\tgoogle.com\n', 'https://google.com'],
    ['', '']
  ]) assert.equal(core.normalizeUrl(input), output);
  assert.equal(submit({ url: ' https://example.org/ ' }).approval, 'Offen');
  assert.equal(core.validUrl(' https://example.org/ '), false);
});

test('unsafe, ambiguous and Markdown inputs are never repaired into accepted URLs', () => {
  for (const input of [
    'javascript:alert(1)', 'data:text/html,hello', 'mailto:person@example.org', 'ftp://example.org',
    'https://user:password@example.org', 'person@example.org', 'https://example.org\\evil',
    'example.org/a b', 'https://exam\nple.org', 'https://example.org/a\tb',
    '[google.com](http://google.com)', '<https://example.org>', '//example.org',
    'http:example.org', 'example', '../example.org', 'example.org:99999', 'example..org'
  ]) {
    const normalized = core.normalizeUrl(input);
    assert.equal(normalized, input, input);
    assert.equal(core.validUrl(normalized), false, input);
    const result = submit({ url: input });
    assert.equal(result.approval, 'Fehler', input);
    assert.ok(result.errors.some(error => error.includes('https://example.org')), input);
  }
});

test('resource and source URLs normalize consistently across sheet writes and reads', () => {
  const result = submit({ source_urls: 'sources.example.org/a\nHTTPS://sources.example.org/b\nsources.example.org/a' });
  assert.deepEqual(json(result.resource.sourceUrls), ['https://sources.example.org/a', 'https://sources.example.org/b']);
  const row = core.rowFromResource({ ...result.resource, url: 'resource.example.org', sourceUrls: ['source.example.org'] });
  assert.equal(row.url, 'https://resource.example.org');
  assert.equal(row.source_urls, 'https://source.example.org');
  assert.equal(core.resourceFromRow(row).url, 'https://resource.example.org');
  assert.equal(submit({ source_urls: 'javascript:alert(1)' }).approval, 'Fehler');
});

test('reference URLs normalize in seed tables and public export, with optional empty links preserved', () => {
  const catalogue = reference();
  catalogue.resources = [json(submit({}).resource)];
  catalogue.institutions = [
    { id: 'i-url-test', name: { de: 'Institut', en: 'Institute' }, shortName: '', url: 'institute.example.org', aliases: [] },
    { id: 'i-no-url', name: { de: 'Ohne Link', en: 'No link' }, shortName: '', url: '', aliases: [] }
  ];
  catalogue.maintainers = [{ id: 'm-url-test', name: 'Betreuung', url: 'profile.example.org' }];
  const tables = core.seedTables(catalogue);
  assert.equal(tables.institutions[0].url, 'https://institute.example.org');
  assert.equal(tables.maintainers[0].url, 'https://profile.example.org');
  tables.institutions[0].url = 'different.example.org';
  tables.maintainers[0].url = 'HTTP://profile.example.org';
  const output = json(core.buildPublicCatalogue(tables, now));
  assert.equal(output.institutions[0].url, 'https://different.example.org');
  assert.equal(output.institutions[1].url, '');
  assert.equal(output.maintainers[0].url, 'http://profile.example.org');
  assert.deepEqual(validateCatalogue(output), []);
  tables.maintainers[0].url = 'https://person:password@example.org';
  assert.throws(() => core.buildPublicCatalogue(tables, now), /Betreuung/);
});

test('either German or English alone is sufficient, but both descriptions cannot be missing', () => {
  for (const descriptions of [
    { description_de: 'Eine Beschreibung.', description_en: '' },
    { description_de: '', description_en: 'A description.' }
  ]) {
    const result = submit(descriptions);
    assert.equal(result.approval, 'Offen');
    assert.deepEqual(json(result.errors), []);
  }
  const missing = submit({ description_de: '', description_en: '' });
  assert.equal(missing.approval, 'Fehler');
  assert.ok(missing.errors.some(error => error.includes('Mindestens eine Beschreibung')));
});
