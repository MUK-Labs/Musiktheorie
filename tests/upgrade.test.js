import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function context() {
  const scope = vm.createContext({});
  for (const name of ['Core', 'Code']) vm.runInContext(readFileSync(new URL(`../google-apps-script/${name}.gs`, import.meta.url), 'utf8'), scope);
  return scope;
}
const json = value => JSON.parse(JSON.stringify(value));
const originalInboxHeaders = ['Eingangs-ID', 'Eingegangen', 'Entscheidung', 'Hinweis', 'Herkunft', 'Einladung für', 'Einladungs-ID', 'Art', 'Rückfragekontakt (privat)', 'Notiz (privat)', 'ID', 'Titel', 'Link', 'Beschreibung DE', 'Beschreibung EN', 'Fächer', 'Themen', 'Bildungsbereiche', 'Schwierigkeit', 'Sprachen', 'Format', 'Institutionen', 'Betreuung', 'Autorinnen und Autoren', 'Zugang', 'Lizenz', 'Voraussetzungen DE', 'Voraussetzungen EN', 'Zuletzt geprüft', 'Quellenlinks', 'Status', 'Übergeordnete ID'];

function sheetWith(rows, initialColumns = rows[0].length) {
  const cells = json(rows), writes = [];
  let columns = initialColumns;
  const sheet = {
    cells, writes,
    getMaxColumns: () => columns,
    getLastRow: () => cells.length,
    insertColumnsAfter(_after, count) { columns += count; },
    setColumnWidths() {}, setFrozenRows() {},
    getRange(row, column, height, width) {
      assert.ok(column + width - 1 <= columns);
      return {
        getDisplayValues() { return Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => cells[row - 1 + r]?.[column - 1 + c] ?? '')); },
        setValues(values) {
          writes.push({ row, column, values: json(values) });
          values.forEach((values, r) => values.forEach((value, c) => { (cells[row - 1 + r] ??= [])[column - 1 + c] = value; }));
          return this;
        },
        setBackground() { return this; }, setFontColor() { return this; },
        setFontWeight() { return this; }, setNotes() { return this; }
      };
    }
  };
  return sheet;
}

test('upgrading the original inbox only appends headers and preserves submitted data', () => {
  const scope = context();
  const expected = json(scope.MT_TABLES.inbox.columns.map(column => column[1]));
  const old = [...originalInboxHeaders];
  const submission = old.map((_, index) => `preserved-${index}`);
  const sheet = sheetWith([old, submission]);
  scope.mtEnsureSheet_({ getSheetByName: () => sheet }, 'inbox');
  assert.deepEqual(sheet.cells[0], expected);
  assert.deepEqual(sheet.cells[1], submission);
  assert.equal(sheet.writes.length, 1);
  assert.equal(sheet.writes[0].column, originalInboxHeaders.length + 1);
  scope.mtEnsureSheet_({ getSheetByName: () => sheet }, 'inbox');
  assert.equal(sheet.writes.length, 1, 'running the upgrade again does not rewrite headers');
});

test('inbox upgrade refuses renamed headers or occupied extension columns without overwriting data', () => {
  const scope = context();
  const original = [...originalInboxHeaders];
  for (const rows of [
    [['renamed', ...original.slice(1)]],
    [[...original, 'My custom column']],
    [original, Array.from({ length: 33 }, (_, i) => i === 32 ? 'private custom data' : '')]
  ]) {
    const sheet = sheetWith(rows, 36), before = json(sheet.cells);
    assert.throws(() => scope.mtEnsureSheet_({ getSheetByName: () => sheet }, 'inbox'), /vorhandene Daten bleiben erhalten/);
    assert.deepEqual(sheet.cells, before);
    assert.equal(sheet.writes.length, 0);
  }
});

test('vocabulary update adds subjects and topics once, preserving edited labels and all other tables', () => {
  const scope = context();
  const rows = [
    { _row: 2, facet: 'subjects', id: 'electronic-music', label_de: 'Meine Bezeichnung', label_en: 'My label', aliases: 'My term', parent_id: '' },
    { _row: 3, facet: 'subjects', id: 'instrumentation', label_de: 'Meine Instrumentation', label_en: 'Instruments & orchestration', aliases: 'Custom alias', parent_id: '' }
  ];
  scope.mtRead_ = key => { assert.equal(key, 'vocabulary'); return json(rows); };
  scope.mtWrite_ = (key, row, number) => {
    assert.equal(key, 'vocabulary');
    const index = number ? number - 2 : rows.length;
    rows[index] = { ...json(row), _row: index + 2 };
  };
  scope.mtUpgradeVocabulary_();
  assert.equal(rows.length, 8);
  assert.equal(rows[0].label_de, 'Meine Bezeichnung');
  assert.equal(rows[0].aliases, 'My term');
  assert.equal(rows[1].label_de, 'Meine Instrumentation');
  assert.equal(rows[1].label_en, 'Instrumentation & orchestration');
  assert.match(rows[1].aliases, /Custom alias/);
  assert.ok(rows.filter(row => row.facet === 'topics').every(row => row.parent_id === 'electronic-music'));
  const first = json(rows);
  scope.mtUpgradeVocabulary_();
  assert.deepEqual(rows, first);
});

test('upgrade requires the matching Core.gs before accessing Google services', () => {
  const scope = vm.createContext({});
  vm.runInContext(readFileSync(new URL('../google-apps-script/Code.gs', import.meta.url), 'utf8'), scope);
  assert.throws(() => scope.upgradeCatalogue(), /Code\.gs UND Core\.gs/);
});
