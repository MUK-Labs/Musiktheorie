const params = new URLSearchParams(location.search);
let ui = params.get('ui') === 'en' ? 'en' : 'de';
function selectLanguage(language) {
  ui = language;
  document.documentElement.lang = ui;
  document.title = document.body.dataset[ui === 'de' ? 'titleDe' : 'titleEn'] + ' · Musiktheorie';
  document.querySelectorAll('[data-language]').forEach(element => { element.hidden = element.dataset.language !== ui; });
  document.querySelectorAll('[data-ui-link]').forEach(link => {
    const url = new URL(link.getAttribute('href'), location.href);
    url.searchParams.set('ui', ui);
    link.href = url.href;
  });
  document.querySelectorAll('[data-language-switch]').forEach(link => {
    const url = new URL(location.href); url.searchParams.set('ui', link.dataset.languageSwitch);
    link.href = url.href;
    if (link.dataset.languageSwitch === ui) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  });
}
selectLanguage(ui);
document.querySelectorAll('[data-language-switch]').forEach(link => link.addEventListener('click', event => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const url = new URL(location.href); url.searchParams.set('ui', link.dataset.languageSwitch);
  history.replaceState(null, '', url);
  selectLanguage(link.dataset.languageSwitch);
}));
function publicFormUrl(value) {
  if (typeof value !== 'string' || !value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' || url.port || url.username || url.password || url.hash ||
      !/^\/forms\/d\/(?:e\/)?[A-Za-z0-9_-]+\/viewform$/.test(url.pathname) ||
      [...url.searchParams.keys()].some(key => !['usp', 'embedded'].includes(key))) return '';
    return url.href;
  } catch { return ''; }
}
const formLinks = document.querySelectorAll('[data-contribution-link]');
if (formLinks.length) {
  let url = '';
  try {
    const response = await fetch(new URL('../config.json', import.meta.url), { cache: 'no-cache' });
    if (response.ok) url = publicFormUrl((await response.json()).formUrl);
  } catch {}
  formLinks.forEach(link => { link.hidden = !url; if (url) link.href = url; });
  document.querySelectorAll('[data-form-notice]').forEach(notice => { notice.hidden = Boolean(url); });
}
