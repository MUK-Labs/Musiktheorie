import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/;
const resourceKeys = new Set(['id','title','url','description','subjects','topics','stages','difficulty','languages','type','institutionIds','maintainerIds','authors','access','license','prerequisites','reviewedAt','sourceUrls','status','parentId']);
const secretKey = /^(?:token|tokenHash|invitationCode|invitationHash|codeHash|email|contactEmail|contact|internalNotes|submitterEmail|githubToken|password|secret|privateKey|responseId)$/i;

export function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

export function validateCatalogue(data) {
  const errors = [];
  const error = message => errors.push(message);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const keys = (value, allowed, context) => {
    if (!object(value)) { error(`${context}: expected an object`); return; }
    for (const key of Object.keys(value)) if (!allowed.includes(key)) error(`${context}: unexpected public field '${key}'`);
  };
  const text = (value, context, required = false) => {
    if (typeof value !== 'string' || (required && !value.trim())) error(`${context}: expected ${required ? 'non-empty ' : ''}text`);
  };
  const languageText = (value, context, required = false) => {
    keys(value, ['de','en'], context);
    if (object(value)) {
      for (const [language, content] of Object.entries(value)) text(content, `${context}.${language}`);
      if (required && !Object.values(value).some(content => typeof content === 'string' && content.trim())) error(`${context}: at least one description/label is required`);
    }
  };
  const registry = (entries, context) => {
    if (!Array.isArray(entries)) { error(`${context}: expected an array`); return new Set(); }
    const ids = new Set();
    for (const [index, entry] of entries.entries()) {
      if (!object(entry) || !idPattern.test(entry.id ?? '')) { error(`${context}[${index}]: invalid ID`); continue; }
      if (ids.has(entry.id)) error(`${context}: duplicate ID '${entry.id}'`);
      ids.add(entry.id);
    }
    return ids;
  };
  const refs = (values, ids, context, required = false) => {
    if (!Array.isArray(values)) { error(`${context}: expected an array`); return; }
    if (required && !values.length) error(`${context}: choose at least one value`);
    if (new Set(values).size !== values.length) error(`${context}: duplicate references`);
    for (const value of values) if (!ids.has(value)) error(`${context}: unknown reference '${value}'`);
  };
  const strings = (values, context) => {
    if (!Array.isArray(values) || values.some(value => typeof value !== 'string')) error(`${context}: expected text values`);
  };
  const noPrivateFields = (value, context = 'catalogue') => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (secretKey.test(key)) error(`${context}.${key}: private field must not be published`);
      noPrivateFields(child, `${context}.${key}`);
    }
  };
  if (!object(data)) return ['Catalogue must be an object'];
  keys(data, ['schemaVersion','meta','vocab','institutions','maintainers','resources','collections'], 'catalogue');
  noPrivateFields(data);
  if (data.schemaVersion !== 1) error('schemaVersion: expected 1');
  keys(data.meta, ['title','updatedAt','source'], 'meta');
  text(data.meta?.title, 'meta.title', true);
  text(data.meta?.source, 'meta.source', true);
  if (!data.meta?.updatedAt || !Number.isFinite(Date.parse(data.meta.updatedAt))) error('meta.updatedAt: expected an ISO timestamp');
  const vocabKinds = ['subjects','topics','stages','difficulties','types','languages','access'];
  keys(data.vocab, vocabKinds, 'vocab');
  const vocabIds = Object.fromEntries(vocabKinds.map(kind => [kind, registry(data.vocab?.[kind], `vocab.${kind}`)]));
  for (const id of vocabIds.topics) {
    if (vocabIds.subjects.has(id)) error(`Vocabulary: subjects and topics must have distinct IDs; duplicate '${id}'`);
  }
  for (const kind of vocabKinds) {
    for (const entry of data.vocab?.[kind] ?? []) {
      keys(entry, ['id','label','aliases','parentId'], `vocab.${kind}.${entry.id}`);
      languageText(entry.label, `vocab.${kind}.${entry.id}.label`, true);
      if (entry.aliases !== undefined) strings(entry.aliases, `${entry.id}.aliases`);
      if (entry.parentId && !vocabIds.subjects.has(entry.parentId) && !vocabIds.topics.has(entry.parentId)) error(`${entry.id}: unknown parent '${entry.parentId}'`);
    }
  }
  const ancestors = new Map([...(data.vocab?.subjects ?? []), ...(data.vocab?.topics ?? [])].map(entry => [entry.id, entry.parentId]));
  for (const id of ancestors.keys()) {
    const seen = new Set([id]);
    let parent = ancestors.get(id);
    while (parent) {
      if (seen.has(parent)) { error(`Vocabulary cycle at '${id}'`); break; }
      seen.add(parent); parent = ancestors.get(parent);
    }
  }
  const institutionIds = registry(data.institutions, 'institutions');
  for (const entry of data.institutions ?? []) {
    keys(entry, ['id','name','shortName','url','aliases'], `institution.${entry.id}`);
    languageText(entry.name, `institution.${entry.id}.name`, true);
    if (entry.shortName !== undefined) text(entry.shortName, `${entry.id}.shortName`);
    if (entry.url && !safeHttpUrl(entry.url)) error(`${entry.id}: invalid institution URL`);
    if (entry.aliases !== undefined) strings(entry.aliases, `${entry.id}.aliases`);
  }
  const maintainerIds = registry(data.maintainers, 'maintainers');
  for (const entry of data.maintainers ?? []) {
    keys(entry, ['id','name','url'], `maintainer.${entry.id}`);
    text(entry.name, `${entry.id}.name`, true);
    if (entry.url && !safeHttpUrl(entry.url)) error(`${entry.id}: invalid maintainer URL`);
  }
  const resourceIds = registry(data.resources, 'resources');
  for (const entry of data.resources ?? []) {
    const label = `resource.${entry.id}`;
    keys(entry, [...resourceKeys], label);
    text(entry.title, `${label}.title`, true);
    if (!safeHttpUrl(entry.url)) error(`${label}.url: only public HTTP(S) links without credentials are allowed`);
    languageText(entry.description, `${label}.description`, true);
    languageText(entry.prerequisites, `${label}.prerequisites`);
    refs(entry.subjects, vocabIds.subjects, `${label}.subjects`, true);
    refs(entry.topics, vocabIds.topics, `${label}.topics`);
    refs(entry.stages, vocabIds.stages, `${label}.stages`);
    refs(entry.languages, vocabIds.languages, `${label}.languages`, true);
    refs(entry.institutionIds, institutionIds, `${label}.institutionIds`);
    refs(entry.maintainerIds, maintainerIds, `${label}.maintainerIds`);
    for (const [key, kind] of [['difficulty','difficulties'],['type','types'],['access','access']]) {
      if (!vocabIds[kind].has(entry[key])) error(`${label}.${key}: unknown value '${entry[key]}'`);
    }
    strings(entry.authors, `${label}.authors`);
    text(entry.license, `${label}.license`);
    strings(entry.sourceUrls, `${label}.sourceUrls`);
    for (const url of entry.sourceUrls ?? []) if (!safeHttpUrl(url)) error(`${label}.sourceUrls: invalid URL`);
    if (!['published','unavailable'].includes(entry.status)) error(`${label}.status: unpublished records must not be exported`);
    if (entry.parentId && (!resourceIds.has(entry.parentId) || entry.parentId === entry.id)) error(`${label}.parentId: unknown or self parent`);
    if (entry.reviewedAt && (!/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedAt) || !Number.isFinite(Date.parse(entry.reviewedAt)))) error(`${label}.reviewedAt: expected YYYY-MM-DD`);
  }
  registry(data.collections, 'collections');
  for (const collection of data.collections ?? []) {
    const label = `collection.${collection.id}`;
    keys(collection, ['id','title','description','curator','items'], label);
    languageText(collection.title, `${label}.title`, true);
    languageText(collection.description, `${label}.description`);
    text(collection.curator, `${label}.curator`);
    if (!Array.isArray(collection.items)) { error(`${label}.items: expected an array`); continue; }
    const seen = new Set();
    for (const item of collection.items) {
      keys(item, ['resourceId','note'], `${label}.items`);
      if (!resourceIds.has(item.resourceId)) error(`${label}: missing resource '${item.resourceId}'`);
      if (seen.has(item.resourceId)) error(`${label}: duplicate resource '${item.resourceId}'`);
      seen.add(item.resourceId);
      languageText(item.note, `${label}.${item.resourceId}.note`);
    }
  }
  return errors;
}

export function validateConfig(config) {
  const errors = [];
  const allowed = new Set(['defaultUi','formUrl','reportFormUrl','reportFormFields','githubUrl','siteUrl']);
  if (!config || typeof config !== 'object' || Array.isArray(config)) return ['config: expected object'];
  for (const key of Object.keys(config)) if (!allowed.has(key)) errors.push(`config: unexpected public field '${key}'`);
  if (!['de','en'].includes(config.defaultUi)) errors.push('config.defaultUi: expected de or en');
  for (const key of ['githubUrl','siteUrl']) if (!safeHttpUrl(config[key])) errors.push(`config.${key}: expected HTTP(S) URL`);
  if (config.formUrl) {
    if (!safeHttpUrl(config.formUrl)) errors.push('config.formUrl: invalid URL');
    else {
      const form = new URL(config.formUrl);
      if (form.protocol !== 'https:' || form.hostname !== 'docs.google.com' || !/^\/forms\/d\/(?:e\/)?[A-Za-z0-9_-]+\/viewform$/.test(form.pathname)) {
        errors.push('config.formUrl: use the full HTTPS Google Forms responder URL ending in /viewform; expand shortened links first');
      }
      if (form.hash || [...form.searchParams.keys()].some(key => !['usp','embedded'].includes(key))) errors.push('config.formUrl: invitation values and unrecognized parameters must never be published');
    }
  }
  if (config.reportFormUrl !== undefined && typeof config.reportFormUrl !== 'string') errors.push('config.reportFormUrl: expected a string');
  const fields = config.reportFormFields;
  if (fields !== undefined && (!fields || typeof fields !== 'object' || Array.isArray(fields))) errors.push('config.reportFormFields: expected an object');
  else if (fields) {
    for (const key of Object.keys(fields)) if (!['resourceId','resourceTitle'].includes(key)) errors.push(`config.reportFormFields: unexpected public field '${key}'`);
    for (const key of ['resourceId','resourceTitle']) {
      if (typeof fields[key] !== 'string' || (fields[key] && !/^entry\.\d+$/.test(fields[key]))) errors.push(`config.reportFormFields.${key}: expected an entry.N field key or empty string`);
    }
  }
  if (config.reportFormUrl) {
    try {
      const report = new URL(config.reportFormUrl);
      if (!/^https:\/\/docs\.google\.com\/forms\/d\/(?:e\/)?[A-Za-z0-9_-]+\/viewform$/.test(config.reportFormUrl) || report.protocol !== 'https:' || report.hostname !== 'docs.google.com' || report.port || report.username || report.password || report.search || report.hash) errors.push('config.reportFormUrl: expected the canonical HTTPS Google Forms responder URL without prefilled parameters');
    } catch { errors.push('config.reportFormUrl: invalid URL'); }
    if (!fields?.resourceId || !fields?.resourceTitle || fields.resourceId === fields.resourceTitle) errors.push('config.reportFormFields: an active report form needs two distinct entry.N field keys');
  } else if (fields?.resourceId || fields?.resourceTitle) errors.push('config.reportFormFields: keep both field keys empty until the report form is activated');
  return errors;
}

export async function checkFiles(cataloguePath = path.join(root, 'data/catalogue.json')) {
  const data = JSON.parse(await readFile(cataloguePath, 'utf8'));
  const config = JSON.parse(await readFile(path.join(root, 'config.json'), 'utf8'));
  const errors = [...validateCatalogue(data), ...validateConfig(config)];
  if (errors.length) throw new Error(`Validation failed:\n${errors.map(error => `  - ${error}`).join('\n')}`);
  return data;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkFiles(process.argv[2]).then(data => console.log(`Validated ${data.resources.length} resources and ${data.collections.length} collections.`)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
