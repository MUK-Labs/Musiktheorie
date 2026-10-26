import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../scripts/validate.mjs';

const base = () => ({ defaultUi: 'de', formUrl: '', githubUrl: 'https://github.com/MUK-Labs/Musiktheorie', siteUrl: 'https://muk-labs.github.io/Musiktheorie/' });
const active = () => ({ ...base(), reportFormUrl: 'https://docs.google.com/forms/d/e/public-form/viewform', reportFormFields: { resourceId: 'entry.1234', resourceTitle: 'entry.5678' } });

test('both legacy configuration and unconfigured report links remain valid', () => {
  assert.deepEqual(validateConfig(base()), []);
  assert.deepEqual(validateConfig({ ...base(), reportFormUrl: '', reportFormFields: { resourceId: '', resourceTitle: '' } }), []);
  assert.deepEqual(validateConfig(active()), []);
});

test('report configuration cannot publish invitation parameters, credentials or arbitrary destinations', () => {
  for (const url of [
    'https://docs.google.com/forms/d/e/public-form/viewform?entry.99=private-code',
    'https://docs.google.com/forms/d/e/public-form/viewform#private-code',
    'https://user:password@docs.google.com/forms/d/e/public-form/viewform',
    'https://forms.gle/short', 'http://docs.google.com/forms/d/e/public-form/viewform',
    'https://docs.google.com.evil.example/forms/d/e/public-form/viewform',
    'https://docs.google.com:444/forms/d/e/public-form/viewform', 'javascript:alert(1)'
  ]) assert.ok(validateConfig({ ...active(), reportFormUrl: url }).length, url);
});

test('prefill mappings must be complete, distinct and limited to public resource fields', () => {
  for (const fields of [
    null, [], {}, { resourceId: 'entry.1', resourceTitle: '' },
    { resourceId: 'entry.1', resourceTitle: 'entry.1' },
    { resourceId: 'entry.1&entry.3=code', resourceTitle: 'entry.2' },
    { resourceId: 'entry.1', resourceTitle: 'entry.2', invitationCode: 'entry.3' }
  ]) assert.ok(validateConfig({ ...active(), reportFormFields: fields }).length);
  assert.ok(validateConfig({ ...active(), reportFormUrl: '' }).length);
  assert.ok(validateConfig({ ...active(), editorialEmail: 'private@example.org' }).length);
});
