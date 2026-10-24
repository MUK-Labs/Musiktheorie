import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const coreSource = readFileSync(new URL('../google-apps-script/Core.gs', import.meta.url), 'utf8');
const codeSource = readFileSync(new URL('../google-apps-script/Code.gs', import.meta.url), 'utf8');
const catalogue = JSON.parse(readFileSync(new URL('../data/catalogue.json', import.meta.url), 'utf8'));
const addedFields = ['new_institution_name', 'new_institution_url'];
const now = '2026-10-24T18:00:00Z';
const copy = value => JSON.parse(JSON.stringify(value));

// Model Google's item identity and ordering, rather than recreating refresh logic.
// A new item starts at the end; moveItem changes its position without changing its ID.
function mockForm() {
  const items = [], additions = [], moves = [];
  let nextId = 1001;
  function addItem(type, initial = false) {
    const id = nextId++;
    const item = {
      type, title: '', required: false, help: '', choices: [], validation: null,
      getId: () => id,
      getIndex: () => items.indexOf(item),
      setTitle(value) { this.title = value; return this; },
      setRequired(value) { this.required = value; return this; },
      setHelpText(value) { this.help = value; return this; },
      setChoiceValues(values) { this.choices = Array.from(values); return this; },
      setValidation(validation) { this.validation = validation; return this; },
    };
    for (const kind of ['Text', 'ParagraphText', 'Checkbox', 'List']) {
      item[`as${kind}Item`] = () => {
        assert.equal(type, kind, 'refresh must preserve each existing question type');
        return item;
      };
    }
    items.push(item);
    if (!initial) additions.push(id);
    return item;
  }
  return {
    items, additions, moves, addInitialItem: type => addItem(type, true),
    addTextItem: () => addItem('Text'),
    addParagraphTextItem: () => addItem('ParagraphText'),
    addCheckboxItem: () => addItem('Checkbox'),
    addListItem: () => addItem('List'),
    getItemById(id) {
      const item = items.find(candidate => candidate.getId() === id);
      if (!item) throw new Error(`Question ${id} no longer exists`);
      return item;
    },
    moveItem(from, to) {
      assert.ok(Number.isInteger(from) && from >= 0 && from < items.length);
      assert.ok(Number.isInteger(to) && to >= 0 && to < items.length);
      const [item] = items.splice(from, 1);
      items.splice(to, 0, item);
      moves.push({ id: item.getId(), from, to });
      return item;
    },
  };
}

function harness() {
  const context = vm.createContext({});
  vm.runInContext(coreSource, context);
  vm.runInContext(codeSource, context);
  const tables = copy(context.CatalogueCore.seedTables(catalogue));
  const definitions = copy(context.mtFormDefinitions_(catalogue));
  const form = mockForm();
  const oldIds = {};
  for (const definition of definitions.filter(definition => !addedFields.includes(definition.key))) {
    const type = definition.options ? (definition.multiple ? 'Checkbox' : 'List') : definition.paragraph ? 'ParagraphText' : 'Text';
    oldIds[definition.key] = form.addInitialItem(type).getId();
  }
  const properties = {
    CATALOGUE_FORM_ID: 'form-upgrade-test', FORM_FIELD_IDS: JSON.stringify(oldIds), FORM_CHOICES_PENDING: 'true',
  };
  const propertyApi = {
    getProperty: key => properties[key] ?? null,
    setProperty(key, value) { properties[key] = String(value); return this; },
    deleteProperty(key) { delete properties[key]; return this; },
  };
  context.PropertiesService = { getScriptProperties: () => propertyApi };
  context.FormApp = {
    openById(id) { assert.equal(id, properties.CATALOGUE_FORM_ID); return form; },
    createTextValidation() {
      return {
        pattern: '', help: '',
        requireTextMatchesPattern(pattern) { this.pattern = pattern; return this; },
        setHelpText(help) { this.help = help; return this; },
        build() { return { pattern: this.pattern, help: this.help }; },
      };
    },
  };
  // Keep real snapshot construction and definitions; mock only persistence/services.
  context.mtTables_ = () => tables;
  context.mtNow_ = () => now;
  context.mtSetting_ = () => {};
  const fieldIds = () => JSON.parse(properties.FORM_FIELD_IDS);
  return {
    context, form, tables, definitions, properties, oldIds, fieldIds,
    refresh: () => context.refreshFormChoices(),
    item: key => form.getItemById(Number(fieldIds()[key])),
    orderedKeys() {
      const byId = new Map(Object.entries(fieldIds()).map(([key, id]) => [Number(id), key]));
      return form.items.map(item => byId.get(item.getId()));
    },
  };
}

test('adding institution questions preserves existing IDs and inserts them beside institution choices', () => {
  const h = harness();
  const oldItems = new Map(h.form.items.map(item => [item.getId(), item]));
  const invitationItem = h.item('invitation_code');
  h.refresh();

  for (const [key, id] of Object.entries(h.oldIds)) {
    assert.equal(h.fieldIds()[key], id, `existing ${key} ID must remain stable`);
    assert.equal(h.item(key), oldItems.get(id), `existing ${key} question must not be replaced`);
  }
  assert.equal(h.item('invitation_code'), invitationItem, 'old invitation links must still target the same question');
  assert.equal(h.form.additions.length, 2, 'only the two new institution questions are created');
  assert.deepEqual(h.orderedKeys(), h.definitions.map(definition => definition.key));
  const institutionIndex = h.orderedKeys().indexOf('institution_ids');
  assert.deepEqual(h.orderedKeys().slice(institutionIndex, institutionIndex + 4), [
    'institution_ids', 'new_institution_name', 'new_institution_url', 'maintainer_ids',
  ]);
  assert.equal(h.orderedKeys().at(-1), 'invitation_code');
  assert.equal(h.item('new_institution_name').required, false);
  assert.equal(h.item('new_institution_url').required, false);
  assert.equal(h.properties.FORM_CHOICES_PENDING, undefined);
});

test('repeated refresh updates choices without duplicating questions or changing invitation IDs', () => {
  const h = harness();
  h.refresh();
  const firstIds = h.fieldIds(), firstOrder = [...h.form.items], firstMoves = h.form.moves.length;
  h.tables.institutions.push({
    id: 'inst-form-upgrade-test', name_de: 'Neue Testakademie', name_en: 'New test academy',
    short_name: 'NTA', url: 'https://example.org/', aliases: '',
  });
  h.refresh();
  h.refresh();

  assert.deepEqual(h.fieldIds(), firstIds);
  assert.deepEqual(h.form.items, firstOrder, 'existing question objects retain their order');
  assert.equal(h.form.additions.length, 2);
  assert.equal(h.form.moves.length, firstMoves, 'an already migrated form needs no further moves');
  assert.equal(h.item('institution_ids').choices.filter(value => value === 'NTA [inst-form-upgrade-test]').length, 1);
  assert.equal(h.fieldIds().invitation_code, h.oldIds.invitation_code);
});

test('both URL questions allow ordinary domains, HTTP(S) and surrounding spaces in the form', () => {
  const h = harness();
  h.refresh();
  for (const key of ['url', 'new_institution_url']) {
    const validation = h.item(key).validation;
    assert.ok(validation?.pattern, `${key} must have URL validation`);
    assert.match(validation.help, /example\.org/);
    const pattern = new RegExp(validation.pattern);
    for (const value of [
      'example.org', 'www.example.org/lesson', 'example.org:8443/lesson?ui=de#part1',
      'https://example.org/lesson', 'http://example.org', 'HTTPS://example.org',
      '  example.org  ', '  https://example.org/lesson  ',
    ]) assert.equal(pattern.test(value), true, `${key} should accept ${JSON.stringify(value)}`);
    for (const value of [
      '', '   ', 'noURL', 'not a URL', 'javascript:alert(1)', 'ftp://example.org',
      'example.org/a b', '<https://example.org>',
    ]) assert.equal(pattern.test(value), false, `${key} should reject ${JSON.stringify(value)}`);
  }
  assert.equal(h.item('url').required, true);
  assert.equal(h.item('new_institution_url').required, false);
});
