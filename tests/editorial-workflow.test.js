import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const source = JSON.parse(readFileSync(new URL('../data/catalogue.json', import.meta.url), 'utf8'));
const json = value => JSON.parse(JSON.stringify(value));
const digest = value => createHash('sha256').update(value).digest('hex');
const now = '2026-10-26T12:00:00Z';
const trustedCode = `mt_${'b'.repeat(64)}`;

function harness({ address = 'redaktion@example.org' } = {}) {
  const scope = vm.createContext({});
  for (const file of ['Core', 'Code']) vm.runInContext(readFileSync(new URL(`../google-apps-script/${file}.gs`, import.meta.url), 'utf8'), scope);
  const tables = json(scope.CatalogueCore.seedTables(source));
  Object.assign(tables, { inbox: [], reports: [], invitations: [], settings: [], editorialSettings: [{ key: 'Redaktions-E-Mail', value: address, description: 'Preserved description' }] });
  const mainMap = Object.fromEntries(scope.mtFormDefinitions_(source).map((field, index) => [field.key, index + 101]));
  const reportMap = { resource_id: 501, resource_title: 502, reason: 503, details: 504, contact: 505 };
  const properties = {
    CATALOGUE_SPREADSHEET_ID: 'private-book', CATALOGUE_FORM_ID: 'main-form', CATALOGUE_REPORT_FORM_ID: 'report-form',
    FORM_FIELD_IDS: JSON.stringify(mainMap), REPORT_FIELD_IDS: JSON.stringify(reportMap), GITHUB_TOKEN: 'PRIVATE_TEST_TOKEN'
  };
  const state = { messages: [], writes: [], quota: 20, failMail: false, failSentWrite: false, published: 0, flushes: 0, duringMail: null };
  const propertyApi = {
    getProperty: key => properties[key] ?? null,
    setProperty(key, value) { properties[key] = String(value); return this; },
    deleteProperty(key) { delete properties[key]; return this; }
  };
  scope.PropertiesService = { getScriptProperties: () => propertyApi };
  let locked = false, nextId = 0;
  scope.LockService = { getScriptLock: () => ({
    waitLock() { assert.equal(locked, false); locked = true; },
    tryLock() { assert.equal(locked, false); locked = true; return true; },
    releaseLock() { locked = false; }
  }) };
  scope.mtRead_ = key => {
    assert.ok(tables[key], `Unknown table ${key}`);
    return tables[key].map((row, index) => ({ ...json(row), _row: index + 2 }));
  };
  scope.mtWrite_ = (key, row, rowNumber) => {
    const index = rowNumber ? rowNumber - 2 : tables[key].length;
    tables[key][index] = { ...json(row), _row: index + 2 };
    state.writes.push({ key, index, type: 'whole-row' });
    return index + 2;
  };
  scope.mtBook_ = () => ({
    getUrl: () => 'https://docs.google.com/spreadsheets/d/private-book/edit',
    getSheetByName(name) {
      const key = Object.keys(scope.MT_TABLES).find(key => scope.MT_TABLES[key].name === name);
      return { getRange(row, column, height, width) {
        assert.equal(height, 1);
        assert.equal(width, scope.MT_NOTIFICATION_FIELDS.length);
        assert.equal(column, scope.MT_TABLES[key].columns.length - width + 1, 'mail writes must never include editorial fields');
        return {
          setNumberFormat() { return this; },
          setValues(values) {
            if (state.failSentWrite && values[0][0] === 'Gesendet') { state.failSentWrite = false; throw new Error('Simulated spreadsheet write failure'); }
            scope.MT_NOTIFICATION_FIELDS.forEach((field, index) => { tables[key][row - 2][field[0]] = values[0][index]; });
            state.writes.push({ key, index: row - 2, type: 'notification-only' });
            return this;
          }
        };
      } };
    }
  });
  scope.SpreadsheetApp = { flush() { state.flushes++; } };
  scope.MailApp = {
    getRemainingDailyQuota: () => state.quota,
    sendEmail(message) {
      assert.ok(state.flushes > 0, 'persist the sending state before dispatch');
      if (state.failMail) throw new Error('Simulated mail failure');
      state.messages.push(json(message)); state.quota--;
      if (state.duringMail) state.duringMail();
    }
  };
  scope.mtNow_ = () => now;
  scope.mtId_ = prefix => `${prefix}test-${++nextId}`;
  scope.mtHash_ = digest;
  scope.mtTryPublish_ = () => { state.published++; };
  const response = (id, fields, map) => ({
    getId: () => id,
    getItemResponses: () => Object.entries(fields).filter(([key]) => map[key]).map(([key, value]) => ({
      getItem: () => ({ getId: () => map[key] }), getResponse: () => value
    }))
  });
  const fields = changes => ({
    ...json(scope.CatalogueCore.rowFromResource(source.resources[0])),
    title: 'Eine echte Ressource im Testmodell', url: 'https://example.org/editorial-workflow-test',
    parent_id: '', institution_ids: '', maintainer_ids: '', new_institution_name: '', new_institution_url: '',
    contact: 'PRIVATE_CONTACT@example.org', internal_note: 'PRIVATE_NOTE', ...changes
  });
  const submit = (id = 'response-one', changes = {}) => scope.catalogueOnFormSubmit({
    source: { getId: () => properties.CATALOGUE_FORM_ID }, response: response(id, fields(changes), mainMap)
  });
  const report = (id = 'report-one', changes = {}) => scope.catalogueOnReportSubmit({
    source: { getId: () => properties.CATALOGUE_REPORT_FORM_ID },
    response: response(id, { resource_id: source.resources[0].id, resource_title: 'Ressource', reason: 'Broken link [broken-link]', details: 'PRIVATE_REPORT_DETAILS', contact: 'PRIVATE_REPORT_CONTACT@example.org', ...changes }, reportMap)
  });
  return { scope, tables, properties, state, submit, report, response, mainMap, reportMap };
}

test('editorial address defaults to blank, remains private, and existing settings survive an upgrade', () => {
  const h = harness({ address: '' });
  h.tables.editorialSettings = [];
  h.scope.mtEnsureEditorialSettings_();
  assert.equal(h.tables.editorialSettings[0].value, '');
  h.tables.editorialSettings[0].value = 'redaktion@example.org';
  const before = json(h.tables.editorialSettings);
  h.scope.mtEnsureEditorialSettings_();
  assert.deepEqual(h.tables.editorialSettings, before);
  for (const address of ['', 'one@example.org,two@example.org', 'one@example.org\nBcc: other@example.org']) {
    h.tables.editorialSettings[0].value = address;
    h.submit(`public-${address}`);
  }
  assert.equal(h.state.messages.length, 0);
  assert.ok(h.tables.inbox.every(row => row.notification_state === 'Ausstehend'));
  const exported = JSON.stringify(h.scope.mtSnapshot_());
  assert.ok(!exported.includes('PRIVATE_'));
  assert.ok(!exported.includes('notification_'));
  assert.ok(!exported.includes('Redaktions-E-Mail'));
});

test('public proposals and invalid proposals notify once; duplicate events and recovery preserve sent state', () => {
  const h = harness();
  h.submit(); h.submit();
  assert.equal(h.tables.inbox.length, 1);
  assert.equal(h.tables.inbox[0].decision, 'Offen');
  assert.equal(h.tables.inbox[0].notification_state, 'Gesendet');
  assert.equal(h.state.messages.length, 1);
  h.submit('invalid-one', { description_de: '', description_en: '' });
  h.submit('invalid-one', { description_de: '', description_en: '' });
  assert.equal(h.tables.inbox[1].decision, 'Fehler');
  assert.equal(h.tables.inbox[1].notification_state, 'Gesendet');
  assert.equal(h.state.messages.length, 2);
  assert.equal(h.state.messages[0].to, 'redaktion@example.org');
  assert.ok(!JSON.stringify(h.state.messages).includes('PRIVATE_'));
  assert.ok(!('replyTo' in h.state.messages[0]));
  assert.equal(h.state.published, 0);
});

test('trusted valid submissions publish without review mail; trusted invalid submissions request attention', () => {
  const h = harness();
  h.tables.invitations.push({ invitation_id: 'i-trusted', label: 'Kollegin', code_hash: digest(trustedCode), active: 'true', use_count: '0' });
  h.submit('trusted-valid', { invitation_code: trustedCode });
  assert.equal(h.tables.inbox[0].decision, 'Übernommen');
  assert.equal(h.state.messages.length, 0);
  assert.equal(h.state.published, 1);
  h.submit('trusted-invalid', { invitation_code: trustedCode, url: 'javascript:alert(1)' });
  assert.equal(h.tables.inbox[1].decision, 'Fehler');
  assert.equal(h.state.messages.length, 1);
  assert.ok(!JSON.stringify(h.state.messages).includes(trustedCode));
});

test('mail failures and exhausted quotas keep pending jobs, with retry independent of approval', () => {
  const h = harness();
  h.state.failMail = true;
  assert.doesNotThrow(() => h.submit());
  assert.equal(h.tables.inbox[0].notification_state, 'Ausstehend');
  h.scope.mtSelectedRows_ = () => h.scope.mtRead_('inbox');
  h.scope.publishCatalogue = () => { h.state.published++; };
  assert.doesNotThrow(() => h.scope.approveSelectedSubmissions());
  assert.equal(h.tables.inbox[0].decision, 'Übernommen');
  assert.equal(h.state.published, 1);
  h.state.failMail = false; h.state.quota = 0;
  h.report();
  assert.equal(h.tables.reports[0].notification_state, 'Ausstehend');
  h.state.quota = 20;
  h.scope.sendPendingNotifications();
  assert.equal(h.tables.inbox[0].notification_state, 'Entfällt');
  assert.equal(h.tables.reports[0].notification_state, 'Gesendet');
  assert.equal(h.state.messages.length, 1);
  h.scope.sendPendingNotifications();
  assert.equal(h.state.messages.length, 1);
});

test('notification bookkeeping does not overwrite a concurrent spreadsheet edit', () => {
  const h = harness();
  h.state.duringMail = () => {
    h.tables.inbox[0].decision = 'Abgelehnt';
    h.tables.inbox[0].internal_note = 'Updated by an editor during mail delivery';
  };
  h.submit();
  assert.equal(h.tables.inbox[0].notification_state, 'Gesendet');
  assert.equal(h.tables.inbox[0].decision, 'Abgelehnt');
  assert.equal(h.tables.inbox[0].internal_note, 'Updated by an editor during mail delivery');
});

test('an interrupted post-delivery write is surfaced without automatically sending a duplicate', () => {
  const h = harness();
  h.state.failSentWrite = true;
  h.submit();
  assert.equal(h.state.messages.length, 1);
  assert.equal(h.tables.inbox[0].notification_state, 'Wird gesendet');
  h.scope.sendPendingNotifications();
  assert.equal(h.tables.inbox[0].notification_state, 'Unklar');
  assert.equal(h.state.messages.length, 1);
});

test('anonymous reports are deduplicated and validated privately without changing resources', () => {
  const h = harness();
  const before = json(h.tables.resources);
  h.report(); h.report();
  h.report('unknown-target', { resource_id: 'missing-resource', details: '', reason: 'invented-reason', status: 'published' });
  assert.equal(h.tables.reports.length, 2);
  assert.ok(h.tables.reports.every(row => row.status === 'Offen'));
  assert.match(h.tables.reports[1].diagnostic, /nicht im aktuellen Katalog/);
  assert.match(h.tables.reports[1].diagnostic, /Beschreibung der Meldung fehlt/);
  assert.equal(h.state.messages.length, 2);
  assert.deepEqual(h.tables.resources, before);
  assert.equal(h.state.published, 0);
  assert.ok(!JSON.stringify(h.scope.mtSnapshot_()).includes('PRIVATE_REPORT'));
  assert.throws(() => h.scope.catalogueOnReportSubmit({ source: { getId: () => 'wrong-form' }, response: {} }), /Ungültige Meldeformularquelle/);
});

function reportFormMock() {
  const items = [], settings = {};
  let nextId = 701;
  const form = {
    items, settings,
    getId: () => 'report-form',
    getEditUrl: () => 'https://docs.google.com/forms/d/report-form/edit',
    getPublishedUrl: () => 'https://docs.google.com/forms/d/e/public-report/viewform?usp=sf_link#ignored',
    getItemById: id => items.find(item => item.getId() === id),
    moveItem(from, to) { items.splice(to, 0, items.splice(from, 1)[0]); },
    supportsAdvancedResponderPermissions: () => true,
    createResponse() {
      const answers = [];
      return {
        withItemResponse(answer) { answers.push(answer); return this; },
        toPrefilledUrl() { return `https://docs.google.com/forms/d/e/public-report/viewform?usp=pp_url&${answers.map(answer => `entry.${answer.entryId}=${encodeURIComponent(answer.value)}`).join('&')}`; }
      };
    }
  };
  for (const method of ['setDescription', 'setCollectEmail', 'setLimitOneResponsePerUser', 'setAllowResponseEdits', 'setPublishingSummary', 'setShowLinkToRespondAgain', 'setConfirmationMessage', 'setPublished']) {
    form[method] = value => { settings[method] = value; return form; };
  }
  for (const type of ['Text', 'ParagraphText', 'List']) {
    form[`add${type}Item`] = () => {
      const id = nextId++;
      const item = {
        getId: () => id, getIndex: () => items.indexOf(item),
        createResponse: value => ({ entryId: id + 9000, value })
      };
      item[`as${type}Item`] = () => item;
      for (const method of ['setTitle', 'setRequired', 'setHelpText', 'setChoiceValues']) item[method] = value => { item[`${method}Value`] = value; return item; };
      items.push(item); return item;
    };
  }
  return form;
}

test('report form setup preserves IDs, derives entry IDs from prefilled markers, and keeps anonymous settings', () => {
  const h = harness();
  delete h.properties.CATALOGUE_REPORT_FORM_ID;
  delete h.properties.REPORT_FIELD_IDS;
  h.properties.REPORT_ANONYMOUS_ACCESS_CONFIRMED = 'true';
  const form = reportFormMock(), triggers = [];
  let creates = 0;
  h.scope.FormApp = { create() { creates++; return form; }, openById: () => form };
  h.scope.mtEnsureTrigger_ = (handler, type, id) => { if (!triggers.some(t => t.handler === handler && t.id === id)) triggers.push({ handler, type, id }); };
  h.scope.mtEnsureReportForm_();
  assert.equal(h.properties.REPORT_ANONYMOUS_ACCESS_CONFIRMED, undefined);
  const fieldIds = JSON.parse(h.properties.REPORT_FIELD_IDS);
  const publicFields = JSON.parse(h.properties.REPORT_PUBLIC_FIELDS);
  assert.equal(publicFields.resourceId, `entry.${fieldIds.resource_id + 9000}`);
  assert.equal(publicFields.resourceTitle, `entry.${fieldIds.resource_title + 9000}`);
  h.properties.REPORT_ANONYMOUS_ACCESS_CONFIRMED = 'true';
  h.scope.mtEnsureReportForm_();
  assert.equal(creates, 1);
  assert.equal(form.items.length, 5);
  assert.equal(triggers.length, 1);
  assert.equal(h.properties.REPORT_ANONYMOUS_ACCESS_CONFIRMED, 'true');
  assert.deepEqual(JSON.parse(h.properties.REPORT_FIELD_IDS), fieldIds);
  for (const setting of ['setCollectEmail', 'setLimitOneResponsePerUser', 'setAllowResponseEdits', 'setPublishingSummary']) assert.equal(form.settings[setting], false);
  assert.equal(h.scope.mtPublicFormUrl_(form), 'https://docs.google.com/forms/d/e/public-report/viewform');
  assert.equal(h.state.messages.length, 0);
});

test('report configuration is published only after its separate anonymous-access confirmation', () => {
  const h = harness(), form = reportFormMock(), updates = [];
  delete h.properties.REPORT_FIELD_IDS;
  h.scope.FormApp = { openById: () => form };
  h.scope.mtEnsureTrigger_ = () => {};
  h.scope.mtEnsureReportForm_();
  const initial = { defaultUi: 'de', formUrl: '', reportFormUrl: '', reportFormFields: { resourceId: '', resourceTitle: '' } };
  h.scope.mtUpdateCatalogue_ = () => now;
  h.scope.Utilities = {
    Charset: { UTF_8: 'utf8' },
    base64Decode: value => Buffer.from(value, 'base64'),
    newBlob: value => ({ getDataAsString: () => Buffer.from(value).toString('utf8') }),
    base64Encode: value => Buffer.from(value).toString('base64')
  };
  h.scope.mtGithub_ = (path, method, body) => {
    assert.equal(path, 'config.json');
    if (method === 'get') return { sha: 'previous', content: Buffer.from(JSON.stringify(initial)).toString('base64') };
    updates.push(JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')));
  };
  h.scope.publishCatalogue();
  assert.equal(updates.length, 0);
  h.scope.SpreadsheetApp.getUi = () => ({ ButtonSet: { YES_NO: 'buttons' }, Button: { YES: 'yes' }, alert: () => 'yes' });
  h.scope.confirmReportAnonymousAccess();
  assert.equal(updates.length, 1);
  assert.equal(updates[0].formUrl, '', 'confirming reports must not activate the contribution form');
  assert.equal(updates[0].reportFormUrl, 'https://docs.google.com/forms/d/e/public-report/viewform');
  assert.deepEqual(updates[0].reportFormFields, JSON.parse(h.properties.REPORT_PUBLIC_FIELDS));
  assert.ok(!JSON.stringify(updates).includes('PRIVATE_'));
});
