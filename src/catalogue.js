/** Pure catalogue and URL-state operations shared by the browser and tests. */
export const FACETS = Object.freeze([
  'subject', 'topic', 'stage', 'difficulty', 'institution', 'maintainer', 'language', 'type', 'access',
]);

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/;
const MAX_SELECTION = 500;
const uniqueIds = values => [...new Set(values.filter(value => ID_PATTERN.test(value)))].slice(0, MAX_SELECTION);

export function getText(value, ui = 'de') {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const preferred = ui === 'en' ? ['en', 'de'] : ['de', 'en'];
  for (const key of [...preferred, ...Object.keys(value)]) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key];
  }
  return '';
}

export function getLabel(entry, ui = 'de') {
  if (!entry) return '';
  if (typeof entry === 'string') return entry;
  return getText(entry.label ?? entry.name ?? entry.title, ui) || entry.id || '';
}

export function normalise(value) {
  return String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/ß/g, 'ss');
}

function queryPart(input) {
  if (input instanceof URLSearchParams) return input;
  const value = String(input ?? '');
  if (/^https?:\/\//i.test(value)) return new URL(value).searchParams;
  return new URLSearchParams(value.replace(/^\?/, '').split('#')[0]);
}

export function readState(input = '') {
  const params = queryPart(input);
  const state = {
    ui: params.get('ui') === 'en' ? 'en' : 'de',
    q: (params.get('q') ?? '').slice(0, 500),
    sort: ['title', 'newest'].includes(params.get('sort')) ? params.get('sort') : '',
    collection: ID_PATTERN.test(params.get('collection') ?? '') ? params.get('collection') : '',
    items: uniqueIds((params.get('items') ?? '').split(',')),
    resource: ID_PATTERN.test(params.get('resource') ?? '') ? params.get('resource') : '',
    title: (params.get('title') ?? '').slice(0, 200),
  };
  for (const facet of FACETS) {
    state[facet] = uniqueIds(params.getAll(facet).flatMap(value => value.split(',')));
  }
  if (state.items.length) state.collection = '';
  return state;
}

export function writeState(input) {
  const state = { ...readState(), ...input };
  const params = new URLSearchParams();
  params.set('ui', state.ui === 'en' ? 'en' : 'de');
  if (state.q?.trim()) params.set('q', state.q.trim().slice(0, 500));
  for (const facet of FACETS) {
    for (const value of uniqueIds(state[facet] ?? [])) params.append(facet, value);
  }
  const ids = uniqueIds(state.items ?? []);
  if (ids.length) {
    params.set('items', ids.join(','));
    if (state.title?.trim()) params.set('title', state.title.trim().slice(0, 200));
  } else if (ID_PATTERN.test(state.collection ?? '')) {
    params.set('collection', state.collection);
  }
  if (['title', 'newest'].includes(state.sort)) params.set('sort', state.sort);
  if (ID_PATTERN.test(state.resource ?? '')) params.set('resource', state.resource);
  return `?${params.toString()}`;
}

function published(resources) {
  return (resources ?? []).filter(resource => ['published', 'unavailable'].includes(resource.status));
}

export function resolveBaseResources(catalogue, state) {
  const resources = published(catalogue.resources);
  const lookup = new Map(resources.map(resource => [resource.id, resource]));
  let ids;
  if (state.items?.length) ids = uniqueIds(state.items);
  else if (state.collection) {
    const collection = (catalogue.collections ?? []).find(item => item.id === state.collection);
    if (!collection) return { resources: [], missingIds: [], missingCollection: state.collection };
    ids = uniqueIds(collection.items.map(item => item.resourceId));
  }
  if (!ids) return { resources, missingIds: [] };
  return {
    resources: ids.filter(id => lookup.has(id)).map(id => lookup.get(id)),
    missingIds: ids.filter(id => !lookup.has(id)),
  };
}

function termLookup(catalogue) {
  return new Map([...(catalogue.vocab?.subjects ?? []), ...(catalogue.vocab?.topics ?? [])].map(entry => [entry.id, entry]));
}

function withAncestors(ids, lookup) {
  const visited = new Set(ids ?? []);
  const pending = [...visited];
  while (pending.length) {
    const parent = lookup.get(pending.pop())?.parentId;
    if (parent && !visited.has(parent)) {
      visited.add(parent);
      pending.push(parent);
    }
  }
  return [...visited];
}

function allStrings(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(allStrings);
  return [];
}

function searchText(resource, catalogue) {
  const vocabulary = [
    ['subjects', resource.subjects], ['topics', resource.topics], ['stages', resource.stages],
    ['languages', resource.languages], ['difficulties', [resource.difficulty]],
    ['types', [resource.type]], ['access', [resource.access]],
  ].flatMap(([kind, ids]) => (catalogue.vocab?.[kind] ?? []).filter(entry => ids?.includes(entry.id)));
  const institutions = (catalogue.institutions ?? []).filter(item => resource.institutionIds?.includes(item.id));
  const maintainers = (catalogue.maintainers ?? []).filter(item => resource.maintainerIds?.includes(item.id));
  return normalise(allStrings([
    resource.title, resource.url, resource.description, resource.prerequisites, resource.authors,
    vocabulary,
    institutions.flatMap(item => [item.name, item.shortName, item.aliases]),
    maintainers.map(item => item.name),
  ]).join(' '));
}

export function filterResources(catalogue, input) {
  const state = { ...readState(), ...input };
  const terms = termLookup(catalogue);
  const scope = resolveBaseResources(catalogue, state).resources;
  const fields = {
    stage: 'stages', institution: 'institutionIds', maintainer: 'maintainerIds',
    language: 'languages', difficulty: 'difficulty', type: 'type', access: 'access',
  };
  const query = normalise(state.q).trim().split(/\s+/).filter(Boolean);
  const asciiGerman = text => text.replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
  const result = scope.filter(resource => {
    const subjectIds = withAncestors([...(resource.subjects ?? []), ...(resource.topics ?? [])], terms);
    if (state.subject.length && !state.subject.some(id => subjectIds.includes(id))) return false;
    const topicIds = withAncestors(resource.topics ?? [], terms);
    if (state.topic.length && !state.topic.some(id => topicIds.includes(id))) return false;
    for (const [facet, key] of Object.entries(fields)) {
      const values = Array.isArray(resource[key]) ? resource[key] : [resource[key]];
      if (state[facet].length && !state[facet].some(id => values.includes(id))) return false;
    }
    if (query.length) {
      const haystack = searchText(resource, catalogue);
      const alternative = asciiGerman(haystack);
      if (!query.every(term => haystack.includes(term) || alternative.includes(asciiGerman(term)))) return false;
    }
    return true;
  });
  if (!state.sort && (state.items.length || state.collection)) return result;
  const collator = new Intl.Collator(state.ui, { numeric: true, sensitivity: 'base' });
  return result.sort((left, right) => {
    if (state.sort === 'newest') {
      const diff = (Date.parse(right.reviewedAt) || 0) - (Date.parse(left.reviewedAt) || 0);
      if (diff) return diff;
    }
    return collator.compare(left.title, right.title) || collator.compare(left.id, right.id);
  });
}
