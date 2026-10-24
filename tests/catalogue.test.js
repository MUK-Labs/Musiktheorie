import test from 'node:test';
import assert from 'node:assert/strict';
import { readState, writeState, filterResources, resolveBaseResources, getText, getLabel } from '../src/catalogue.js';
import { validateCatalogue, validateConfig } from '../scripts/validate.mjs';

const term = (id, de, en = de, extra = {}) => ({ id, label: { de, en }, ...extra });
const resource = (id, title, patch = {}) => ({
  id, title, url: `https://example.org/${id}`, description: { de: `${title} auf Deutsch`, en: '' },
  subjects: ['harmony'], topics: [], stages: ['bachelor'], difficulty: 'introductory', languages: ['de'],
  type: 'interactive', institutionIds: ['mdw'], maintainerIds: ['editor'], authors: [], access: 'free',
  license: '', prerequisites: { de: '', en: '' }, reviewedAt: '2026-10-24', sourceUrls: [], status: 'published', parentId: '', ...patch,
});
const catalogue = () => ({
  schemaVersion: 1, meta: { title: 'Catalogue', updatedAt: '2026-10-24T00:00:00Z', source: 'test-fixture' },
  vocab: {
    subjects: [term('harmony', 'Harmonielehre', 'Harmony'), term('aural-skills', 'Gehörbildung', 'Aural skills', { aliases: ['ear training'] }), term('counterpoint','Kontrapunkt','Counterpoint')],
    topics: [term('fugue', 'Fuge', 'Fugue', { parentId: 'counterpoint' })],
    stages: [term('bachelor','Bachelor'),term('music-school','Musikschule','Music school')],
    difficulties: [term('introductory','Grundlagen','Introductory')],
    languages: [term('de','Deutsch','German'),term('en','Englisch','English')],
    types: [term('interactive','Interaktiv','Interactive')], access: [term('free','Frei zugänglich','Free access')],
  },
  institutions: [{ id:'mdw', name:{ de:'Universität für Musik und darstellende Kunst Wien', en:'University of Music and Performing Arts Vienna' }, shortName:'mdw', url:'https://www.mdw.ac.at/', aliases:['Vienna'] }],
  maintainers: [{ id:'editor', name:'Example Editor', url:'' }],
  resources: [
    resource('r-b','Beta'),
    resource('r-a','Alpha',{ subjects:['aural-skills'], stages:['music-school'], institutionIds:[], description:{ de:'Intervalle hören', en:'Interval listening' } }),
    resource('r-c','Gamma',{ topics:['fugue'], languages:['en'] }),
  ],
  collections: [{ id:'c-one', title:{de:'Sammlung',en:'Collection'}, description:{de:'',en:''}, curator:'Editors', items:[{resourceId:'r-c',note:{de:'',en:''}},{resourceId:'r-a',note:{de:'',en:''}}] }],
});

test('shared URL reconstructs filters, language, selection order, title and detail', () => {
  const original = readState('?ui=en&q=Geh%C3%B6rbildung&subject=harmony&subject=counterpoint&stage=bachelor&items=r-c,r-a&title=My+lesson&resource=r-a');
  assert.deepEqual(readState(writeState(original)), original);
  assert.deepEqual(original.items, ['r-c','r-a']);
  assert.equal(original.collection, '');
  assert.equal(readState('https://example.org/Musiktheorie/?ui=en&language=de').ui,'en');
});

test('unknown query data cannot become approval, markup or an additional state field', () => {
  const state = readState('?trusted=true&code=private&subject=%3Cscript%3E&subject=harmony&subject=harmony&collection=c-one&items=r-a');
  assert.deepEqual(state.subject, ['harmony']);
  assert.equal(state.collection, '');
  assert.equal('trusted' in state, false);
  assert.equal(writeState(state).includes('private'), false);
});

test('facets use OR inside a facet and AND across facets', () => {
  const data = catalogue();
  assert.deepEqual(filterResources(data,readState('?subject=harmony&subject=aural-skills')).map(r=>r.id),['r-a','r-b','r-c']);
  assert.deepEqual(filterResources(data,readState('?subject=harmony&subject=aural-skills&institution=mdw&language=de')).map(r=>r.id),['r-b']);
});

test('broad subjects find assigned child topics', () => {
  assert.deepEqual(filterResources(catalogue(),readState('?subject=counterpoint')).map(r=>r.id),['r-c']);
});

test('German, English and transliterated aliases search the same catalogue', () => {
  for (const q of ['Gehörbildung','gehoerbildung','ear training','Interval listening']) {
    assert.deepEqual(filterResources(catalogue(),readState(`?ui=de&q=${encodeURIComponent(q)}`)).map(r=>r.id),['r-a']);
  }
  assert.deepEqual(filterResources(catalogue(),readState('?q=Vienna%20Editor&language=de')).map(r=>r.id),['r-b']);
});

test('UI language does not imply the resource language', () => {
  assert.deepEqual(filterResources(catalogue(),readState('?ui=en&language=de')).map(r=>r.id),['r-a','r-b']);
  assert.equal(getText({de:'Deutsche Beschreibung',en:''},'en'),'Deutsche Beschreibung');
  assert.equal(getLabel(term('harmony','Harmonielehre','Harmony'),'en'),'Harmony');
});

test('collection and selection order persist unless sort is explicitly overridden', () => {
  const data = catalogue();
  assert.deepEqual(filterResources(data,readState('?collection=c-one')).map(r=>r.id),['r-c','r-a']);
  assert.deepEqual(filterResources(data,readState('?collection=c-one&sort=title')).map(r=>r.id),['r-a','r-c']);
  assert.deepEqual(filterResources(data,readState('?items=r-b,r-a,r-c&subject=harmony')).map(r=>r.id),['r-b','r-c']);
});

test('missing shared items are reported; an unknown collection does not become the full catalogue', () => {
  assert.deepEqual(resolveBaseResources(catalogue(),readState('?items=r-missing,r-a')).missingIds,['r-missing']);
  assert.deepEqual(filterResources(catalogue(),readState('?collection=c-missing')),[]);
  const data = catalogue();
  data.resources.push(resource('r-draft','Draft',{status:'pending'}));
  assert.equal(filterResources(data,readState()).some(r=>r.id==='r-draft'),false);
});

test('valid public data passes; invalid references fail before deployment', () => {
  const data = catalogue();
  assert.deepEqual(validateCatalogue(data),[]);
  data.collections[0].items[0].resourceId='missing';
  data.resources[0].institutionIds=['unverified'];
  const errors = validateCatalogue(data).join('\n');
  assert.match(errors,/missing resource/);
  assert.match(errors,/unknown reference/);
});

test('public snapshot rejects private fields, pending entries and executable URLs', () => {
  const data = catalogue();
  data.resources[0].invitationCode='not-a-real-token';
  data.resources[0].url='javascript:alert(1)';
  data.resources[1].status='pending';
  const errors=validateCatalogue(data).join('\n');
  assert.match(errors,/private field/);
  assert.match(errors,/HTTP\(S\)/);
  assert.match(errors,/unpublished records/);
});

test('topic IDs cannot shadow a subject or form a parent cycle', () => {
  const data = catalogue();
  data.vocab.topics.push(term('harmony','Andere Bedeutung','Different meaning',{parentId:'counterpoint'}));
  assert.match(validateCatalogue(data).join('\n'),/distinct IDs/);
  data.vocab.topics.pop();
  data.vocab.topics[0].parentId='fugue';
  assert.match(validateCatalogue(data).join('\n'),/Vocabulary cycle/);
});

test('public form configuration cannot contain a prefilled invitation', () => {
  const config={defaultUi:'de',formUrl:'https://docs.google.com/forms/d/e/example/viewform',githubUrl:'https://github.com/MUK-Labs/Musiktheorie',siteUrl:'https://muk-labs.github.io/Musiktheorie/'};
  assert.deepEqual(validateConfig(config),[]);
  config.formUrl += '?entry.123456=secret-code';
  assert.match(validateConfig(config).join('\n'),/invitation values/);
  for (const formUrl of [
    'https://forms.gle/opaque-link',
    'https://docs.google.com/document/d/example/view',
    'https://docs.google.com/forms/d/e/example/viewform#entry.123=private',
    'https://docs.google.com/forms/d/e/example/viewform?anything=private',
  ]) assert.ok(validateConfig({...config,formUrl}).length,formUrl);
});
