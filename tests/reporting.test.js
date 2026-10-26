import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportUrl } from '../src/reporting.js';

const config = (changes = {}) => ({
  reportFormUrl: 'https://docs.google.com/forms/d/e/1FAIpQLTest_Ab-c/viewform',
  reportFormFields: { resourceId: 'entry.123', resourceTitle: 'entry.456' },
  ...changes,
});
const resource = (changes = {}) => ({ id: 'r-test.v2:part-1', title: 'Gehörbildung & Analyse', ...changes });

test('report links prefill only the resource ID and title on canonical public Google Forms URLs', () => {
  for (const path of ['e/1FAIpQLTest_Ab-c', '1FormId_Ab-c']) {
    const target = `https://docs.google.com/forms/d/${path}/viewform`;
    const result = new URL(buildReportUrl(config({ reportFormUrl: target }), resource()));
    assert.equal(result.origin + result.pathname, target);
    assert.deepEqual([...result.searchParams], [
      ['usp', 'pp_url'], ['entry.123', 'r-test.v2:part-1'], ['entry.456', 'Gehörbildung & Analyse'],
    ]);
    assert.equal(result.hash, '');
  }
});

test('resource titles remain literal field values instead of injecting query parameters or fragments', () => {
  const title = 'Ästhetik / 音楽? &entry.999=other&invitation_code=example#trusted=yes "<script>"';
  const originalConfig = config();
  const originalResource = resource({ title, invitation_code: 'PRIVATE_EXAMPLE' });
  const before = JSON.stringify([originalConfig, originalResource]);
  const link = buildReportUrl(originalConfig, originalResource);
  const result = new URL(link);
  assert.equal(result.searchParams.get('entry.456'), title);
  assert.equal(result.searchParams.get('entry.123'), originalResource.id);
  assert.deepEqual([...result.searchParams.keys()], ['usp', 'entry.123', 'entry.456']);
  assert.equal(result.hash, '');
  assert.ok(!link.includes('PRIVATE_EXAMPLE'));
  assert.equal(JSON.stringify([originalConfig, originalResource]), before);
});

test('unconfigured or incomplete reporting returns a fallback instead of a partially filled link', () => {
  for (const value of [
    undefined, null, {}, { reportFormUrl: '' },
    config({ reportFormFields: undefined }), config({ reportFormFields: null }),
    config({ reportFormFields: {} }), config({ reportFormFields: [] }),
    config({ reportFormFields: { resourceId: 'entry.123' } }),
    config({ reportFormFields: { resourceId: '', resourceTitle: 'entry.456' } }),
    config({ reportFormFields: { resourceId: 'entry.123', resourceTitle: '' } }),
  ]) assert.equal(buildReportUrl(value, resource()), '');
});

test('private prefill parameters, fragments, alternate hosts and nonpublic form paths are rejected', () => {
  const canonical = config().reportFormUrl;
  for (const reportFormUrl of [
    'http://docs.google.com/forms/d/e/1Test/viewform',
    'https://forms.gle/example',
    'https://docs.google.com.example.org/forms/d/e/1Test/viewform',
    'https://example.org/forms/d/e/1Test/viewform',
    'https://user:password@docs.google.com/forms/d/e/1Test/viewform',
    'https://docs.google.com:8443/forms/d/e/1Test/viewform',
    'https://docs.google.com/forms/d/e/1Test/edit',
    'https://docs.google.com/forms/d/e/1Test/viewform/',
    'https://docs.google.com/forms/d/e/1Test%2Fprivate/viewform',
    `${canonical}?usp=pp_url&entry.789=private`,
    `${canonical}?invitation_code=private`, `${canonical}?trusted=true`,
    `${canonical}#invitation_code=private`, `${canonical}?`, `${canonical}#`,
    ` ${canonical}`, `${canonical}\n`,
    'javascript:alert(1)', '//docs.google.com/forms/d/e/1Test/viewform',
  ]) assert.equal(buildReportUrl(config({ reportFormUrl }), resource()), '', reportFormUrl);
});

test('field configuration cannot add privileged or malformed parameters or overwrite another field', () => {
  for (const reportFormFields of [
    { resourceId: 'invitation_code', resourceTitle: 'entry.456' },
    { resourceId: 'entry.123', resourceTitle: 'trusted' },
    { resourceId: 'entry.123&trusted=true', resourceTitle: 'entry.456' },
    { resourceId: 'entry.123', resourceTitle: 'entry.456#fragment' },
    { resourceId: 'entry.123', resourceTitle: 'entry.123' },
    { resourceId: 123, resourceTitle: 'entry.456' },
    { resourceId: 'entry.-123', resourceTitle: 'entry.456' },
    { resourceId: 'entry.123', resourceTitle: 'entry.456', invitationCode: 'entry.789' },
    { resourceId: 'entry.123', resourceTitle: 'entry.456', trusted: 'true' },
  ]) assert.equal(buildReportUrl(config({ reportFormFields }), resource()), '');
});

test('missing or invalid resource identity uses the fallback', () => {
  for (const value of [
    undefined, null, {}, resource({ id: '' }), resource({ id: 'r-test&trusted=true' }),
    resource({ id: '../r-test' }), resource({ id: 'r'.repeat(121) }),
    resource({ title: null }), resource({ title: '' }), resource({ title: '   ' }),
  ]) assert.equal(buildReportUrl(config(), value), '');
});
