import { readState, writeState, filterResources, getLabel, getText, resolveBaseResources } from './catalogue.js';
import { translate } from './i18n.js';
import { buildReportUrl } from './reporting.js';

const $ = (id) => document.getElementById(id);
const STORAGE = 'musiktheorie:v1:';
const facets = [
  { key: 'subject', label: 'subjects', vocabulary: 'subjects' },
  { key: 'stage', label: 'stages', vocabulary: 'stages' },
  { key: 'institution', label: 'institutions', registry: 'institutions' },
  { key: 'maintainer', label: 'maintainers', registry: 'maintainers' },
  { key: 'difficulty', label: 'difficulties', vocabulary: 'difficulties' },
  { key: 'language', label: 'languages', vocabulary: 'languages' },
  { key: 'type', label: 'types', vocabulary: 'types' },
  { key: 'access', label: 'access', vocabulary: 'access' },
  { key: 'topic', label: 'topics', vocabulary: 'topics' },
];
const iconPaths = {
  plus: ['M12 5v14M5 12h14'], close: ['m6 6 12 12M18 6 6 18'],
  grid: ['M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z'],
  layers: ['m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5'],
  bookmark: ['M6 3h12v18l-6-4-6 4z'],
  flag: ['M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0'],
  copy: ['M9 8h11v13H9zM15 8V3H4v13h5'],
  search: ['M19 10a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM16.4 16.4 22 22'],
  sliders: ['M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-3M20 14V3M1 10h6M9 12h6M17 18h6'],
  link: ['m10 13 4-4M8 16l-2 2a4.2 4.2 0 0 1-6-6l5-5a4.2 4.2 0 0 1 6 0M16 8l2-2a4.2 4.2 0 0 1 6 6l-5 5a4.2 4.2 0 0 1-6 0'],
  chevron: ['m6 9 6 6 6-6'], external: ['M14 3h7v7M21 3 10 14M10 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6'],
  arrowRight: ['M4 12h16m-6-6 6 6-6 6'], arrowUp: ['M12 20V4m-6 6 6-6 6 6'], arrowDown: ['M12 4v16m-6-6 6 6 6-6'],
  check: ['m5 12 4 4L19 6'], trash: ['M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M10 10v7M14 10v7'],
  building: ['M3 21h18M5 21V8l7-5 7 5v13M8 10h1M15 10h1M8 14h1M15 14h1M10 21v-4h4v4'],
  book: ['M12 5C9 2 5 2 2 3v16c4-1 7-1 10 2 3-3 6-3 10-2V3c-3-1-7-1-10 2ZM12 5v16'],
  headphones: ['M3 14v-3a9 9 0 0 1 18 0v3M3 12h3v8H3zM18 12h3v8h-3z'],
  music: ['M9 18V4l12-2v14M9 4v5l12-2M9 18c0 2-1.7 3-4 3s-3-1.3-3-2.5S3.7 16 6 16c1.4 0 3 .5 3 2ZM21 16c0 2-1.7 3-4 3s-3-1.3-3-2.5S15.7 14 18 14c1.4 0 3 .5 3 2Z'],
  keyboard: ['M2 4h20v16H2zM7 4v16M12 4v16M17 4v16M5 4v8h4V4M15 4v8h4V4'],
  spark: ['m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z'],
  globe: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM2 12h20M12 2c-6 6-6 14 0 20 6-6 6-14 0-20Z'],
  pen: ['m15 3 6 6M4 14l12-12 6 6L10 20l-8 2zM4 14l6 6'],
  alert: ['M12 3 1 21h22zM12 9v5M12 17h.01'], refresh: ['M20 7a9 9 0 1 0 1 9M20 2v6h-6'],
};
let catalogue;
let config = { defaultUi: 'de', formUrl: '', reportFormUrl: '', reportFormFields: {}, githubUrl: 'https://github.com/MUK-Labs/Musiktheorie' };
let state = readState(location.search);
let selectedIds = [];
let selectionTitle = '';
let savedLists = [];
let toastTimer;
let searchTimer;
let syncingDialog = false;
let detailResourceId = '';

const t = (key, values) => translate(state.ui, key, values);

function node(tag, className = '', text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}

function icon(name, small = false) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `icon${small ? ' small' : ''}`);
  svg.setAttribute('aria-hidden', 'true');
  for (const pathData of iconPaths[name] || iconPaths.book) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    svg.append(path);
  }
  return svg;
}

function button(label, className, handler, iconName) {
  const element = node('button', className);
  element.type = 'button';
  if (iconName) element.append(icon(iconName));
  if (label) element.append(node('span', '', label));
  if (handler) element.addEventListener('click', handler);
  return element;
}

function iconButton(label, iconName, handler) {
  const element = button('', 'icon-button', handler, iconName);
  element.setAttribute('aria-label', label);
  element.title = label;
  return element;
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function externalLink(url, label, className = '') {
  const target = safeUrl(url);
  const element = node(target ? 'a' : 'span', className, label);
  if (target) {
    element.href = target;
    element.target = '_blank';
    element.rel = 'noopener noreferrer';
  }
  return element;
}

function hostname(value) {
  try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function readLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(STORAGE + key)) ?? fallback; } catch { return fallback; }
}

function writeLocal(key, value) {
  try { localStorage.setItem(STORAGE + key, JSON.stringify(value)); return true; } catch { return false; }
}

function normalIds(value) {
  return Array.isArray(value) ? [...new Set(value.filter((id) => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(id)))].slice(0,500) : [];
}

function rememberSelection() {
  writeLocal('selection', { items: selectedIds, title: selectionTitle });
}

function emptyState(ui = state.ui) {
  return { ...readState(''), ui };
}

function clearFilters(next = state) {
  const clean = { ...next, q: '' };
  for (const facet of facets) clean[facet.key] = [];
  return clean;
}

function navigate(next, replace = false) {
  clearTimeout(searchTimer);
  state = readState(writeState(next));
  const url = location.pathname + writeState(state);
  if (url !== location.pathname + location.search) history[replace ? 'replaceState' : 'pushState']({}, '', url);
  writeLocal('ui', state.ui);
  render();
}

function sharingUrl(next) {
  return new URL(location.pathname + writeState(next), location.origin).href;
}

function selectionState() {
  return { ...emptyState(), items: [...selectedIds], title: selectionTitle.trim() };
}

function announce(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3400);
}

async function copyText(value, labels = {}) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      announce(labels.success || t('linkCopied'));
      return;
    }
  } catch { /* Offer a local fallback when clipboard permission is unavailable. */ }
  const field = node('textarea', 'sr-only');
  field.value = value;
  document.body.append(field);
  field.focus();
  field.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { /* Show the link below. */ }
  field.remove();
  if (copied) { announce(labels.success || t('linkCopied')); return; }
  showMessage(labels.title || t('copyManually'), [labels.hint || t('copyHint')], value);
}

function showMessage(title, paragraphs, copyValue = '') {
  $('message-title').textContent = title;
  const content = $('message-content');
  content.replaceChildren(...paragraphs.map((text) => node('p', '', text)));
  if (copyValue) {
    const input = node('input', 'text-input');
    input.readOnly = true;
    input.value = copyValue;
    input.setAttribute('aria-label', title);
    input.addEventListener('focus', () => input.select());
    content.append(input);
  }
  const actions = node('div', 'dialog-actions');
  actions.append(button(t('close'), 'button button-primary', () => $('message-dialog').close()));
  content.append(actions);
  if (!$('message-dialog').open) $('message-dialog').showModal();
  if (copyValue) content.querySelector('input')?.focus();
}

function contribute() {
  const url = safeUrl(config.formUrl);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
  else showMessage(t('formNotReadyTitle'), [t('formNotReady'), t('formNotReadyExtra')]);
}

function helpUrl(page = '') {
  return `./help/${page}?${new URLSearchParams({ ui: state.ui })}`;
}

function contributorHelpLink() {
  const link = node('a', 'detail-help-link', t('correctionHelp'));
  link.href = helpUrl('contributors.html');
  return link;
}

function reportResource(resource) {
  const url = buildReportUrl(config, resource);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
  else {
    showMessage(t('reportNotReadyTitle'), [t('reportNotReady'), t('reportNotSent')]);
    const help = node('p'); help.append(contributorHelpLink());
    $('message-content').insertBefore(help, $('message-content').querySelector('.dialog-actions'));
  }
}

function reportButton(resource, compact = false) {
  const element = button(compact ? '' : t('reportIssue'), compact ? 'icon-button report-button' : 'button button-text report-button', () => reportResource(resource), 'flag');
  const label = t('reportResource', { title: resource.title });
  element.setAttribute('aria-label', label);
  element.title = label;
  return element;
}

function lookup(facet, id) {
  const values = facet.registry ? catalogue[facet.registry] : catalogue.vocab[facet.vocabulary];
  return (values || []).find((entry) => entry.id === id);
}

function vocabularyLabel(vocabulary, id) {
  return getLabel((catalogue.vocab[vocabulary] || []).find((entry) => entry.id === id), state.ui) || id;
}

function resourceNames(ids, registry) {
  return (ids || []).map((id) => getLabel((catalogue[registry] || []).find((entry) => entry.id === id), state.ui)).filter(Boolean);
}

function countFilters() {
  return facets.reduce((total, facet) => total + (state[facet.key] || []).length, state.q ? 1 : 0);
}

function renderStatic() {
  document.documentElement.lang = state.ui;
  document.title = `${state.collection ? getText(catalogue.collections.find((entry) => entry.id === state.collection)?.title, state.ui) || t('collections') : state.items.length ? state.title || t('selection') : t('resources')} · Musiktheorie`;
  const texts = {
    'brand-subtitle':'brandSubtitle','contribute-label':'contribute','catalogue-label':'catalogue','collections-label':'collections',
    'saved-label':'saved','help-label':'help','search-label':'search','filter-button-label':'filters','share-view-label':'shareView','sort-label':'sort',
    'review-selection':'reviewSelection','share-selection-label':'shareSelection','mobile-filter-heading':'filters','apply-filters':'showResults',
    'collections-eyebrow':'collectionsEyebrow','collections-dialog-title':'collections','collections-intro':'collectionsIntro',
    'selection-eyebrow':'selectionEyebrow','selection-dialog-title':'selection','selection-intro':'selectionIntro',
    'selection-title-label':'selectionTitle','saved-eyebrow':'savedEyebrow','saved-dialog-title':'saved','saved-intro':'savedIntro',
    'footer-description':'footer','catalogue-note':'editorialNote',
  };
  for (const [id,key] of Object.entries(texts)) $(id).textContent = t(key);
  document.querySelector('.skip-link').textContent = t('skip');
  document.querySelector('.main-nav').setAttribute('aria-label', t('mainNavigation'));
  $('home-link').setAttribute('aria-label', t('home'));
  $('help-link').href = helpUrl();
  $('saved-button').setAttribute('aria-label', t('saved'));
  $('saved-button').title = t('saved');
  $('contribute-button').setAttribute('aria-label', t('contribute'));
  $('share-view').setAttribute('aria-label', t('shareView'));
  $('active-filters').setAttribute('aria-label', t('activeFilters'));
  $('selection-tray').setAttribute('aria-label', t('selection'));
  $('dismiss-selection').setAttribute('aria-label', t('clearSelection'));
  $('results').setAttribute('aria-label', t('resources'));
  document.querySelectorAll('.dialog-close').forEach((element) => element.setAttribute('aria-label', t('close')));
  $('search-input').placeholder = t('searchPlaceholder');
  const searchInput = $('search-input');
  // URL values are canonicalized, but a space at the cursor belongs to the word
  // the user is about to type. Preserve it while the input retains focus.
  if (searchInput.value !== state.q && !(document.activeElement === searchInput && searchInput.value.trim() === state.q)) searchInput.value = state.q;
  $('selection-title').placeholder = t('selectionPlaceholder');
  $('language-de').setAttribute('aria-pressed', String(state.ui === 'de'));
  $('language-en').setAttribute('aria-pressed', String(state.ui === 'en'));
  $('collections-count').textContent = catalogue.collections.length;
  $('catalogue-button').classList.toggle('is-active', !state.collection);
  $('collections-button').classList.toggle('is-active', Boolean(state.collection));
  const sortOptions = [
    { value: '', label: state.collection || state.items.length ? t('curatedOrder') : t('sortTitle') },
    ...(state.collection || state.items.length ? [{ value: 'title', label: t('sortTitle') }] : []),
    { value: 'newest', label: t('sortNewest') },
  ];
  if (state.sort === 'title' && !sortOptions.some((option) => option.value === 'title')) sortOptions[0].value = 'title';
  $('sort-select').replaceChildren(...sortOptions.map(({value,label}) => { const option = node('option', '', label); option.value = value; return option; }));
  $('sort-select').value = state.sort || '';
  const updated = new Date(catalogue.meta.updatedAt);
  $('updated-label').textContent = Number.isNaN(updated.valueOf()) ? '' : t('updated', { date: updated.toLocaleDateString(state.ui === 'de' ? 'de-AT' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) });
  if (safeUrl(config.githubUrl)) $('github-link').href = safeUrl(config.githubUrl);
}

function renderFilters() {
  const panel = $('filter-panel');
  const openGroups = new Map([...panel.querySelectorAll('details[data-group]')].map((element) => [element.dataset.group, element.open]));
  const focused = document.activeElement?.id;
  panel.replaceChildren();
  const heading = node('div', 'filter-panel-header');
  const title = node('h2', '', t('filterBy')); title.id = 'filter-heading';
  const reset = button(t('reset'), '', () => navigate(clearFilters()));
  reset.disabled = countFilters() === 0;
  heading.append(title, reset); panel.append(heading);
  const advanced = node('details', 'advanced-filters');
  advanced.dataset.group = 'advanced';
  advanced.open = openGroups.get('advanced') ?? facets.slice(3).some((facet) => state[facet.key]?.length);
  const advancedSummary = node('summary');
  advancedSummary.append(icon('sliders'), node('span', '', t('moreFilters')), icon('chevron'));
  advanced.append(advancedSummary);
  facets.forEach((facet,index) => {
    const allEntries = (facet.registry ? catalogue[facet.registry] : catalogue.vocab[facet.vocabulary]) || [];
    if (!allEntries.length && index > 2) return;
    const group = node('details', 'filter-group');
    group.dataset.group = facet.key;
    group.open = openGroups.get(facet.key) ?? (index === 0 || Boolean(state[facet.key]?.length));
    const summary = node('summary');
    summary.append(node('span', '', t(facet.label)));
    if (state[facet.key]?.length) summary.append(node('span', 'group-active-count', state[facet.key].length));
    summary.append(icon('chevron')); group.append(summary);
    const options = node('div', 'filter-options');
    const entries = [...allEntries];
    if (facet.registry) entries.sort((a,b) => getLabel(a,state.ui).localeCompare(getLabel(b,state.ui),state.ui));
    const allScope = { ...emptyState(), collection: state.collection, items: [...state.items] };
    const counts = entries.map((entry) => ({entry, count: filterResources(catalogue, { ...state, [facet.key]: [entry.id] }).length,
      exists: filterResources(catalogue, { ...allScope, [facet.key]: [entry.id] }).length > 0 }));
    // Subjects also describe the catalogue's scope, including areas still awaiting resources.
    const showAllSubjects = facet.key === 'subject';
    const relevant = counts.filter(({entry,exists}) => showAllSubjects || exists || state[facet.key]?.includes(entry.id));
    const visibleCount = showAllSubjects ? relevant.length : 8;
    if (!relevant.length) options.append(node('p', 'no-options', t('noOptions')));
    const extra = node('details', 'filter-options-more'); extra.dataset.group = `${facet.key}-more`;
    extra.open = openGroups.get(`${facet.key}-more`) ?? relevant.slice(visibleCount).some(({entry}) => state[facet.key]?.includes(entry.id));
    extra.append(node('summary', '', `${t('showMore')} (${Math.max(relevant.length-visibleCount,0)})`));
    relevant.forEach(({entry,count}, entryIndex) => {
      const label = node('label', 'filter-option');
      const input = node('input'); input.type = 'checkbox'; input.id = `filter-${facet.key}-${entry.id}`; input.value = entry.id;
      input.checked = state[facet.key]?.includes(entry.id) || false;
      input.addEventListener('change', () => {
        const values = new Set(state[facet.key] || []);
        input.checked ? values.add(entry.id) : values.delete(entry.id);
        navigate({ ...state, [facet.key]: [...values] });
      });
      label.append(input, node('span', 'option-label', getLabel(entry,state.ui)), node('span', 'option-count', count));
      (entryIndex < visibleCount ? options : extra).append(label);
    });
    if (relevant.length > visibleCount) options.append(extra);
    group.append(options);
    (index < 3 ? panel : advanced).append(group);
  });
  panel.append(advanced, node('p', 'filter-hint', t('matchHint')));
  if (focused?.startsWith('filter-')) $(focused)?.focus({preventScroll:true});
  const count = countFilters(); $('filter-count').hidden = count === 0; $('filter-count').textContent = count;
}

function renderActiveFilters() {
  const target = $('active-filters'); target.replaceChildren();
  function chip(label, action) {
    const element = button('', 'filter-chip', action);
    element.append(node('span','filter-chip-label',label),icon('close'));
    element.setAttribute('aria-label', `${t('remove')}: ${label}`); target.append(element);
  }
  if (state.q) chip(`“${state.q}”`, () => navigate({ ...state, q: '' }));
  for (const facet of facets) {
    for (const id of state[facet.key] || []) chip(getLabel(lookup(facet,id),state.ui) || id, () => navigate({ ...state, [facet.key]:state[facet.key].filter((value) => value !== id) }));
  }
  if (countFilters() > 1) target.append(button(t('clearFilters'), 'reset-inline', () => navigate(clearFilters())));
}

function resourceMark(resource) {
  const subject = resource.subjects?.[0] || 'fundamentals';
  const icons = { 'aural-skills':'headphones', harmony:'keyboard', counterpoint:'layers', rhythm:'music', tuning:'spark', analysis:'search', instrumentation:'music', composition:'pen', 'historical-practice':'keyboard', pedagogy:'book', form:'grid' };
  const element = node('span', `resource-mark tone-${/^[a-z-]+$/.test(subject) ? subject : 'fundamentals'}`);
  element.setAttribute('aria-hidden','true'); element.append(icon(icons[subject] || 'book')); return element;
}

function fallbackDescription(resource) {
  if (resource.description?.[state.ui]) return null;
  const language = Object.keys(resource.description || {}).find((key) => resource.description[key]);
  return language ? node('p','description-fallback',t('descriptionFallback',{ language:t(language) })) : null;
}

function selectionButton(resource) {
  const isSelected = selectedIds.includes(resource.id);
  const element = button('', 'select-button', () => toggleSelection(resource.id), isSelected ? 'check' : 'plus');
  element.setAttribute('aria-pressed',String(isSelected));
  element.setAttribute('aria-label',t(isSelected ? 'removeSelection' : 'addSelection',{title:resource.title}));
  element.dataset.selectionId = resource.id;
  element.title = t(isSelected ? 'selected' : 'select'); return element;
}

function collectionNote(resourceId) {
  const collection = catalogue.collections.find((item) => item.id === state.collection);
  return getText(collection?.items.find((item) => item.resourceId === resourceId)?.note, state.ui);
}

function renderCard(resource) {
  const card = node('article', `resource-card${selectedIds.includes(resource.id) ? ' is-selected' : ''}`); card.dataset.resourceId=resource.id;
  card.append(resourceMark(resource));
  const main = node('div','resource-main');
  const topline = node('div','resource-topline');
  topline.append(node('span','resource-type',vocabularyLabel('types',resource.type)),node('span','resource-languages',(resource.languages || []).map((id)=>id==='und'?'—':id.toUpperCase()).join(' / ')));
  const title = node('h2','resource-title'); title.append(externalLink(resource.url,resource.title));
  const description = node('p','resource-description',getText(resource.description,state.ui));
  main.append(topline,title,description);
  if(resource.status==='unavailable') main.append(node('p','resource-status',t('unavailableNotice')));
  const fallback=fallbackDescription(resource); if(fallback) main.append(fallback);
  const institutionNames=resourceNames(resource.institutionIds,'institutions');
  const maintainerNames=resourceNames(resource.maintainerIds,'maintainers');
  const attribution=node('div','resource-attribution');
  if(institutionNames.length) attribution.append(icon('building'),node('span','',institutionNames.join(' · ')));
  if(maintainerNames.length) {
    if(institutionNames.length) attribution.append(node('span','attribution-separator','·'));
    attribution.append(node('span','',maintainerNames.join(' · ')));
  }
  if(!institutionNames.length&&!maintainerNames.length) attribution.append(node('span','',hostname(resource.url)));
  main.append(attribution);
  const bottom=node('div','resource-bottom'); const tags=node('div','resource-tags');
  for(const id of (resource.subjects || []).slice(0,2)) tags.append(node('span','tag subject-tag',vocabularyLabel('subjects',id)));
  if(resource.stages?.length) tags.append(node('span','tag',vocabularyLabel('stages',resource.stages[0])));
  const actions=node('div','resource-actions');
  actions.append(button(t('details'),'details-button',()=>navigate({...state,resource:resource.id}),'arrowRight'),reportButton(resource,true),selectionButton(resource));
  bottom.append(tags,actions); main.append(bottom);
  const note=collectionNote(resource.id); if(note) main.append(node('p','collection-item-note',note));
  card.append(main); return card;
}

function renderEmpty(title,text,actionLabel,action) {
  const container=node('div','empty-state'); container.append(icon('music'),node('h2','',title),node('p','',text));
  if(action) container.append(button(actionLabel,'button button-outline',action));
  return container;
}

function renderResults() {
  const scope=resolveBaseResources(catalogue,state);
  const results=filterResources(catalogue,state);
  const collection=catalogue.collections.find((item)=>item.id===state.collection);
  $('page-eyebrow').textContent=t(state.collection?'collectionScope':state.items.length?'selectionScope':'discover');
  $('page-title').textContent=state.collection ? getText(collection?.title,state.ui)||t('collections') : state.items.length ? state.title||t('selection') : t('resources');
  $('page-description').textContent=state.collection ? getText(collection?.description,state.ui) : state.items.length ? t('selectionViewNote') : t('description');
  $('total-count').textContent=scope.resources.length;
  $('results-summary').textContent = countFilters() ? t('filteredResults',{count:results.length,total:scope.resources.length}) : t(results.length===1?'result':'results',{count:results.length});
  const resultsElement=$('results');
  resultsElement.replaceChildren(...results.map(renderCard));
  if(!results.length){
    if(state.collection&&!collection) resultsElement.append(renderEmpty(t('collectionMissing'),'',t('showAll'),()=>navigate(emptyState())));
    else resultsElement.append(renderEmpty(t(countFilters()?'noResults':'emptyCatalogue'),t(countFilters()?'noResultsText':'emptyCatalogueText'),t('clearFilters'),countFilters()?()=>navigate(clearFilters()):null));
  }
  renderScope(scope,collection);
}

function renderScope(scope,collection) {
  const banner=$('scope-banner');
  banner.hidden=!state.collection&&!state.items.length;
  banner.replaceChildren();
  if(banner.hidden) return;
  const copy=node('div');
  copy.append(node('p','scope-label',t(state.collection?'collectionScope':'selectionScope')));
  if(collection?.curator) copy.append(node('p','',`${t('curator')}: ${collection.curator}`));
  else copy.append(node('p','',t('collectionCount',{count:scope.resources.length})));
  if(scope.missingIds.length) copy.append(node('p','scope-notice',t('missingItems',{count:scope.missingIds.length})));
  banner.append(copy);
  const actions=node('div');
  if(countFilters()) actions.append(button(t('showWholeCollection'),'button button-text',()=>navigate(clearFilters())));
  actions.append(button(t('showAll'),'button button-outline',()=>navigate(emptyState()),'grid'));
  banner.append(actions);
}

function toggleSelection(id) {
  const focusedSelection = document.activeElement?.dataset.selectionId;
  const fromSelectionDialog = $('selection-dialog').contains(document.activeElement);
  const previousIndex = selectedIds.indexOf(id);
  const wasSelected=selectedIds.includes(id);
  selectedIds=wasSelected?selectedIds.filter((value)=>value!==id):[...selectedIds,id];
  detailResourceId='';
  rememberSelection();
  if(state.items.length) navigate({...state,items:[...selectedIds]});
  else { renderResults(); renderSelectionTray(); if($('resource-dialog').open) renderResourceDialog(true); }
  if($('selection-dialog').open) renderSelectionDialog();
  if(fromSelectionDialog) {
    const nextItem=$('selection-list').children[Math.max(0,Math.min(previousIndex,selectedIds.length-1))];
    (nextItem?.querySelector('.selection-reorder button:last-child') || $('selection-title')).focus({preventScroll:true});
  } else if(focusedSelection) {
    const scope=$('resource-dialog').open?$('resource-dialog'):$('results');
    const control=[...scope.querySelectorAll('[data-selection-id]')].find((element)=>element.dataset.selectionId===focusedSelection);
    (control || $('results')).focus({preventScroll:true});
  }
  announce(t(wasSelected?'selectionRemoved':'selectionAdded'));
}

function renderSelectionTray() {
  $('selection-tray').hidden=selectedIds.length===0;
  document.body.classList.toggle('has-selection',selectedIds.length>0);
  $('selection-count').textContent=t('selectedCount',{count:selectedIds.length});
}

function reorderSelection(index,delta) {
  const target=index+delta;
  if(target<0||target>=selectedIds.length) return;
  [selectedIds[index],selectedIds[target]]=[selectedIds[target],selectedIds[index]];
  rememberSelection();
  if(state.items.length) navigate({...state,items:[...selectedIds]});
  renderSelectionDialog();
  $('selection-list').children[target]?.querySelector(`[data-direction="${delta}"]`)?.focus();
}

function renderSelectionDialog() {
  $('selection-title').value=selectionTitle;
  const list=$('selection-list'); list.replaceChildren();
  selectedIds.forEach((id,index)=>{
    const resource=catalogue.resources.find((item)=>item.id===id);
    const item=node('li'); item.append(node('span','selection-position',String(index+1).padStart(2,'0')));
    const body=node('div','selection-item-body'); body.append(node('h3',resource?'':'selection-unavailable',resource?.title||t('noLongerAvailable')));
    body.append(node('p','',resource?hostname(resource.url):id)); item.append(body);
    const controls=node('div','selection-reorder');
    const up=iconButton(`${t('moveUp')}: ${resource?.title||id}`,'arrowUp',()=>reorderSelection(index,-1)); up.disabled=index===0; up.dataset.direction='-1';
    const down=iconButton(`${t('moveDown')}: ${resource?.title||id}`,'arrowDown',()=>reorderSelection(index,1)); down.disabled=index===selectedIds.length-1; down.dataset.direction='1';
    controls.append(up,down,iconButton(`${t('remove')}: ${resource?.title||id}`,'close',()=>toggleSelection(id))); item.append(controls); list.append(item);
  });
  if(!selectedIds.length) list.append(renderEmpty(t('selectionEmpty'),t('selectionEmptyText')));
  const actions=$('selection-dialog-actions'); actions.replaceChildren();
  if(selectedIds.length) {
    actions.append(button(t('copySelection'),'button button-primary',()=>copyText(sharingUrl(selectionState())),'link'));
    actions.append(button(t('viewSelection'),'button button-outline',()=>{ $('selection-dialog').close(); navigate(selectionState()); window.scrollTo({top:0,behavior:'smooth'}); },'grid'));
    actions.append(button(t('saveList'),'button button-text',saveSelection,'bookmark'));
  }
}

function saveSelection() {
  if(!selectedIds.length) return;
  const title=selectionTitle.trim()||t('untitledList');
  const existing=savedLists.find((list)=>list.title===title&&JSON.stringify(list.items)===JSON.stringify(selectedIds));
  const next=existing ? savedLists : [...savedLists,{ id:globalThis.crypto?.randomUUID?.()||`list-${Date.now()}`, title, items:[...selectedIds], updatedAt:new Date().toISOString() }];
  if(writeLocal('lists',next)){savedLists=next;announce(t('listSaved'));}
  else announce(t('storageUnavailable'));
}

function renderSavedDialog() {
  const target=$('saved-list'); target.replaceChildren();
  if(!savedLists.length){target.append(renderEmpty(t('noSaved'),t('noSavedText')));return;}
  for(const saved of [...savedLists].reverse()){
    const entry=node('article','saved-entry'); const body=node('div','saved-entry-body');
    body.append(node('h3','',saved.title),node('p','',t('collectionCount',{count:saved.items.length}))); entry.append(body);
    const actions=node('div','saved-entry-actions');
    actions.append(button(t('loadList'),'button button-outline',()=>{
      selectedIds=[...saved.items];selectionTitle=saved.title;rememberSelection();$('saved-dialog').close();navigate(selectionState());window.scrollTo({top:0,behavior:'smooth'});
    }));
    actions.append(iconButton(`${t('deleteList')}: ${saved.title}`,'trash',()=>{
      if(!window.confirm(t('listDeleteConfirm')))return;
      const next=savedLists.filter((item)=>item.id!==saved.id);
      if(writeLocal('lists',next)){savedLists=next;renderSavedDialog();announce(t('listDeleted'));}else announce(t('storageUnavailable'));
    }));
    entry.append(actions); target.append(entry);
  }
}

function renderCollectionsDialog() {
  const target=$('collections-list'); target.replaceChildren();
  catalogue.collections.forEach((collection,index)=>{
    const card=node('article','collection-card');
    card.append(node('div','collection-number',String(index+1).padStart(2,'0')),node('h3','',getText(collection.title,state.ui)),node('p','',getText(collection.description,state.ui)));
    const footer=node('div','collection-card-footer');
    footer.append(node('span','',t('collectionCount',{count:collection.items.length})),button(t('openCollection'),'button button-outline',()=>{
      $('collections-dialog').close();navigate({...emptyState(),collection:collection.id});window.scrollTo({top:0,behavior:'smooth'});
    },'arrowRight'));
    card.append(footer);target.append(card);
  });
  if(!catalogue.collections.length) target.append(node('p','dialog-intro',t('noCollections')));
}

function detailRow(dl,label,content) {
  if(!content||(Array.isArray(content)&&!content.length))return;
  dl.append(node('dt','',label)); const value=node('dd');
  if(typeof content==='string')value.textContent=content;
  else if(Array.isArray(content))content.forEach((part,index)=>{if(index)value.append(document.createTextNode(' · '));value.append(part);});
  else value.append(content);
  dl.append(value);
}

function renderResourceDialog(force=false) {
  const dialog=$('resource-dialog');
  if(!state.resource){
    detailResourceId='';
    if(dialog.open){syncingDialog=true;dialog.close();queueMicrotask(()=>{syncingDialog=false;});}
    return;
  }
  const resource=catalogue.resources.find((item)=>item.id===state.resource);
  const detail=$('resource-detail');
  if(detailResourceId===`${state.resource}:${state.ui}`&&!force&&dialog.open)return;
  detailResourceId=`${state.resource}:${state.ui}`;detail.replaceChildren();
  const top=node('div','resource-detail-top');
  if(resource)top.append(resourceMark(resource));
  const heading=node('div','resource-detail-heading');
  if(resource)heading.append(node('span','resource-type',vocabularyLabel('types',resource.type)));
  const title=node('h2','',resource?.title||t('resourceUnavailable'));title.id='resource-dialog-title';heading.append(title);top.append(heading);
  top.append(iconButton(t('close'),'close',()=>dialog.close()));detail.append(top);dialog.setAttribute('aria-labelledby','resource-dialog-title');
  if(resource){
    detail.append(node('p','resource-detail-description',getText(resource.description,state.ui)));
    if(resource.status==='unavailable') detail.append(node('p','resource-status',t('unavailableNotice')));
    const fallback=fallbackDescription(resource);if(fallback)detail.append(fallback);
    const tags=node('div','resource-detail-tags');
    for(const id of resource.subjects||[])tags.append(node('span','tag subject-tag',vocabularyLabel('subjects',id)));
    for(const id of resource.topics||[])tags.append(node('span','tag',vocabularyLabel('topics',id)));
    detail.append(tags);
    const dl=node('dl','resource-detail-dl');
    detailRow(dl,t('stages'),(resource.stages||[]).map((id)=>vocabularyLabel('stages',id)).join(' · '));
    detailRow(dl,t('difficulties'),vocabularyLabel('difficulties',resource.difficulty));
    detailRow(dl,t('contentLanguage'),(resource.languages||[]).map((id)=>vocabularyLabel('languages',id)).join(' · '));
    detailRow(dl,t('institution'),(resource.institutionIds||[]).map((id)=>catalogue.institutions.find((item)=>item.id===id)).filter(Boolean).map((item)=>externalLink(item.url,getLabel(item,state.ui))));
    detailRow(dl,t('maintainer'),(resource.maintainerIds||[]).map((id)=>catalogue.maintainers.find((item)=>item.id===id)).filter(Boolean).map((item)=>externalLink(item.url,getLabel(item,state.ui))));
    detailRow(dl,t('author'),(resource.authors||[]).join(' · '));
    detailRow(dl,t('prerequisites'),getText(resource.prerequisites,state.ui));
    detailRow(dl,t('access'),vocabularyLabel('access',resource.access));
    detailRow(dl,t('license'),resource.license||t('licenseUnknown'));
    if(resource.reviewedAt)detailRow(dl,t('reviewed'),resource.reviewedAt);
    if(resource.parentId){const parent=catalogue.resources.find((item)=>item.id===resource.parentId);if(parent)detailRow(dl,t('parentResource'),externalLink(parent.url,parent.title));}
    if(resource.sourceUrls?.length){const sources=node('div','detail-source-list');for(const url of resource.sourceUrls)sources.append(externalLink(url,hostname(url)));detailRow(dl,t('sources'),sources);}
    const resourceId=node('div','resource-id-value');
    resourceId.append(node('code','',resource.id),iconButton(t('copyResourceId'),'copy',()=>copyText(resource.id,{
      success:t('resourceIdCopied'),title:t('copyResourceId'),hint:t('copyResourceIdHint'),
    })));
    detailRow(dl,t('resourceId'),resourceId);
    detail.append(dl);
    const note=collectionNote(resource.id);if(note)detail.append(node('p','collection-item-note',note));
    const actions=node('div','resource-primary-actions');
    const open=externalLink(resource.url,t('openResource'),'button button-primary');open.append(icon('external'));actions.append(open);
    const select=button(t(selectedIds.includes(resource.id)?'selected':'select'),'button button-outline',()=>toggleSelection(resource.id),selectedIds.includes(resource.id)?'check':'plus');
    select.dataset.selectionId=resource.id;
    select.setAttribute('aria-pressed',String(selectedIds.includes(resource.id)));
    actions.append(select);
    actions.append(button(t('shareResource'),'button button-text',()=>copyText(sharingUrl({...emptyState(),resource:resource.id})),'link'));
    const support=node('div','resource-support-actions');
    support.append(reportButton(resource),contributorHelpLink());
    detail.append(actions,support,node('p','resource-detail-footnote',t('editorialNote')));
  }else detail.append(node('p','resource-detail-description',t('resourceUnavailableText')));
  if(!dialog.open)dialog.showModal();
}

function render() {
  if(!catalogue)return;
  renderStatic();renderFilters();renderActiveFilters();renderResults();renderSelectionTray();renderResourceDialog();
  if($('collections-dialog').open)renderCollectionsDialog();
  if($('selection-dialog').open)renderSelectionDialog();
  if($('saved-dialog').open)renderSavedDialog();
}

function openFilters() {
  $('mobile-filter-mount').append($('filter-panel'));
  $('filters-dialog').showModal();
}

function bindEvents() {
  document.querySelectorAll('[data-icon]').forEach((slot)=>slot.append(icon(slot.dataset.icon)));
  document.querySelectorAll('[data-close]').forEach((element)=>element.addEventListener('click',()=>$(element.dataset.close).close()));
  document.querySelectorAll('dialog').forEach((dialog)=>dialog.addEventListener('click',(event)=>{
    if(event.target!==dialog)return;
    const rect=dialog.getBoundingClientRect();
    if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();
  }));
  $('home-link').addEventListener('click',(event)=>{event.preventDefault();navigate(emptyState());});
  $('catalogue-button').addEventListener('click',()=>navigate(emptyState()));
  $('contribute-button').addEventListener('click',contribute);
  $('language-de').addEventListener('click',()=>navigate({...state,ui:'de'}));
  $('language-en').addEventListener('click',()=>navigate({...state,ui:'en'}));
  $('search-input').addEventListener('input',(event)=>{
    clearTimeout(searchTimer);const value=event.target.value;
    state={...state,q:value};
    searchTimer=setTimeout(()=>navigate({...state,q:value},true),180);
  });
  $('search-input').addEventListener('keydown',(event)=>{if(event.key==='Enter'){event.preventDefault();navigate({...state,q:event.target.value});}});
  $('sort-select').addEventListener('change',(event)=>navigate({...state,sort:event.target.value}));
  $('share-view').addEventListener('click',()=>copyText(sharingUrl(state)));
  $('open-filters').addEventListener('click',openFilters);
  $('apply-filters').addEventListener('click',()=>$('filters-dialog').close());
  $('filters-dialog').addEventListener('close',()=>$('desktop-filter-mount').append($('filter-panel')));
  window.matchMedia('(min-width: 801px)').addEventListener('change',(event)=>{if(event.matches&&$('filters-dialog').open)$('filters-dialog').close();});
  $('collections-button').addEventListener('click',()=>{if(catalogue){renderCollectionsDialog();$('collections-dialog').showModal();}});
  $('saved-button').addEventListener('click',()=>{if(catalogue){renderSavedDialog();$('saved-dialog').showModal();}});
  $('review-selection').addEventListener('click',()=>{renderSelectionDialog();$('selection-dialog').showModal();});
  $('share-selection').addEventListener('click',()=>copyText(sharingUrl(selectionState())));
  $('selection-title').addEventListener('input',(event)=>{selectionTitle=event.target.value.slice(0,120);rememberSelection();if(state.items.length){state.title=selectionTitle;history.replaceState({},'',location.pathname+writeState(state));}});
  $('selection-dialog').addEventListener('close',()=>{if(state.items.length)navigate({...state,title:selectionTitle},true);});
  $('dismiss-selection').addEventListener('click',()=>{
    selectedIds=[];selectionTitle='';rememberSelection();
    if(state.items.length)navigate(emptyState());else{renderResults();renderSelectionTray();}
    announce(t('selectionCleared'));
  });
  $('resource-dialog').addEventListener('close',()=>{if(!syncingDialog&&state.resource)navigate({...state,resource:''});});
  window.addEventListener('popstate',()=>{
    clearTimeout(searchTimer);state=readState(location.search);
    if(state.items.length){selectedIds=[...state.items];selectionTitle=state.title||'';rememberSelection();}
    detailResourceId='';render();
  });
  document.addEventListener('keydown',(event)=>{
    if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!document.querySelector('dialog[open]')&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){
      event.preventDefault();$('search-input').focus();
    }
  });
}

async function start() {
  bindEvents();
  try {
    const [catalogueResponse,configResponse]=await Promise.all([fetch('./data/catalogue.json'),fetch('./config.json')]);
    if(!catalogueResponse.ok)throw new Error(`Catalogue HTTP ${catalogueResponse.status}`);
    catalogue=await catalogueResponse.json();
    if(configResponse.ok)config={...config,...await configResponse.json()};
    if(!catalogue?.resources||!catalogue?.vocab||!catalogue?.collections)throw new Error('Invalid catalogue');
    const params=new URLSearchParams(location.search);
    if(!params.has('ui')){const preferred=readLocal('ui',config.defaultUi);state.ui=['de','en'].includes(preferred)?preferred:'de';}
    const storedSelection=readLocal('selection',{});
    selectedIds=state.items.length?[...state.items]:normalIds(storedSelection.items);
    selectionTitle=state.items.length?state.title||'':typeof storedSelection.title==='string'?storedSelection.title.slice(0,120):'';
    const storedLists=readLocal('lists',[]);
    savedLists=Array.isArray(storedLists)?storedLists.filter((list)=>list&&typeof list.id==='string'&&typeof list.title==='string'&&Array.isArray(list.items)).map((list)=>({...list,title:list.title.slice(0,120),items:normalIds(list.items)})):[];
    history.replaceState({},'',location.pathname+writeState(state));
    render();
  }catch(error){
    $('results-summary').textContent='';
    $('results').replaceChildren(renderEmpty(t('errorTitle'),t('errorText'),t('reload'),()=>location.reload()));
    console.error('Catalogue load failed:',error);
  }
}

start();
