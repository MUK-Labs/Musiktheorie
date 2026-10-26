const PUBLIC_FORM_URL = /^https:\/\/docs\.google\.com\/forms\/d\/(?:e\/)?[A-Za-z0-9_-]+\/viewform$/;
const FORM_FIELD = /^entry\.\d+$/;
const RESOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;

/** Return a public report link, or an empty string until its configuration is complete. */
export function buildReportUrl(config, resource) {
  if (typeof config?.reportFormUrl !== 'string' || !PUBLIC_FORM_URL.test(config.reportFormUrl)) return '';
  const fields = config.reportFormFields;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return '';
  if (Object.keys(fields).some(key => key !== 'resourceId' && key !== 'resourceTitle')) return '';
  if (!['resourceId', 'resourceTitle'].every(key => typeof fields[key] === 'string' && FORM_FIELD.test(fields[key]))) return '';
  if (fields.resourceId === fields.resourceTitle) return '';
  if (typeof resource?.id !== 'string' || !RESOURCE_ID.test(resource.id)) return '';
  if (typeof resource.title !== 'string' || !resource.title.trim()) return '';

  // Start with a canonical public URL: no private invitation, role or existing prefill
  // parameters can be carried across. Resource text is encoded only as field values.
  const url = new URL(config.reportFormUrl);
  url.searchParams.set('usp', 'pp_url');
  url.searchParams.set(fields.resourceId, resource.id);
  url.searchParams.set(fields.resourceTitle, resource.title);
  return url.href;
}
