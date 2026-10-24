/** Pure catalogue rules. No credentials, network calls or Google services here. */
var CatalogueCore = (function () {
  'use strict';
  var FACETS = ['subjects', 'topics', 'stages', 'difficulties', 'types', 'languages', 'access'];
  var RESOURCE_COLUMNS = ['id', 'title', 'url', 'description_de', 'description_en', 'subjects', 'topics', 'stages', 'difficulty', 'languages', 'type', 'institution_ids', 'maintainer_ids', 'authors', 'access', 'license', 'prerequisites_de', 'prerequisites_en', 'reviewed_at', 'source_urls', 'status', 'parent_id'];

  function text(value) { return value === null || value === undefined ? '' : String(value).trim(); }
  function list(value) {
    var values = Array.isArray(value) ? value : text(value).split(/\s*;\s*|\r?\n/);
    return values.map(text).filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i; });
  }
  function choiceId(value) {
    var v = text(value), match = v.match(/\[([a-zA-Z0-9][a-zA-Z0-9._:-]*)\]$/);
    if (v === 'Keine Zuordnung / None') return '';
    return match ? match[1] : v;
  }
  function choices(value) { return list(value).map(choiceId).filter(Boolean); }
  function validId(value) { return /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(text(value)); }
  function validUrl(value) {
    // URLs are data: disallow script schemes, credentials, whitespace and empty hosts.
    return /^https?:\/\/(?![^/?#]*@)(?:\[[0-9a-fA-F:]+\]|[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?)(?::[0-9]{1,5})?(?:[/?#][^\s<>"\\]*)?$/.test(text(value));
  }
  function localized(de, en) { return { de: text(de), en: text(en) }; }
  function active(value) { return value === true || /^(true|1|ja|yes|aktiv|active)$/i.test(text(value)); }
  function published(value) { return /^(published|approved|freigegeben)$/i.test(text(value)); }
  function dateText(value) {
    if (value instanceof Date) return isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
    return text(value).slice(0, 10);
  }
  function literalCell(value) {
    // Google Sheets can interpret untrusted leading '=' as a formula, including URLs.
    var v = value === null || value === undefined ? '' : String(value);
    return /^[\s]*[=+@-]/.test(v) ? "'" + v : v;
  }
  function rowFromResource(resource) {
    var r = resource || {};
    return {
      id: text(r.id), title: text(r.title), url: text(r.url),
      description_de: text((r.description || {}).de), description_en: text((r.description || {}).en),
      subjects: list(r.subjects).join('; '), topics: list(r.topics).join('; '), stages: list(r.stages).join('; '),
      difficulty: text(r.difficulty) || 'unspecified', languages: list(r.languages).join('; '), type: text(r.type),
      institution_ids: list(r.institutionIds).join('; '), maintainer_ids: list(r.maintainerIds).join('; '),
      authors: list(r.authors).join('; '), access: text(r.access) || 'unknown', license: text(r.license),
      prerequisites_de: text((r.prerequisites || {}).de), prerequisites_en: text((r.prerequisites || {}).en),
      reviewed_at: dateText(r.reviewedAt), source_urls: list(r.sourceUrls).join('; '),
      status: r.status === 'published' ? 'Freigegeben' : text(r.status) || 'Entwurf', parent_id: text(r.parentId)
    };
  }
  function resourceFromRow(row) {
    return {
      id: text(row.id), title: text(row.title), url: text(row.url),
      description: localized(row.description_de, row.description_en),
      subjects: choices(row.subjects), topics: choices(row.topics), stages: choices(row.stages),
      difficulty: choiceId(row.difficulty) || 'unspecified', languages: choices(row.languages), type: choiceId(row.type),
      institutionIds: choices(row.institution_ids), maintainerIds: choices(row.maintainer_ids),
      authors: list(row.authors), access: choiceId(row.access) || 'unknown', license: text(row.license),
      prerequisites: localized(row.prerequisites_de, row.prerequisites_en),
      reviewedAt: dateText(row.reviewed_at), sourceUrls: list(row.source_urls), status: 'published', parentId: text(row.parent_id)
    };
  }
  function indexById(values) {
    var map = Object.create(null);
    (values || []).forEach(function (entry) { map[text(entry.id)] = entry; });
    return map;
  }
  function validateResource(resource, catalogue) {
    var errors = [], vocab = catalogue.vocab || {};
    if (!validId(resource.id)) errors.push('Ungültige Ressourcen-ID.');
    if (!resource.title || resource.title.length > 500) errors.push('Titel fehlt oder ist länger als 500 Zeichen.');
    if (!validUrl(resource.url)) errors.push('Ein gültiger http(s)-Link ist erforderlich.');
    if (!resource.description.de && !resource.description.en) errors.push('Mindestens eine Beschreibung (DE oder EN) ist erforderlich.');
    if (resource.description.de.length > 12000 || resource.description.en.length > 12000) errors.push('Eine Beschreibung darf höchstens 12.000 Zeichen lang sein.');
    if (!resource.subjects.length) errors.push('Mindestens ein Fach ist erforderlich.');
    if (!resource.languages.length) errors.push('Mindestens eine Ressourcensprache ist erforderlich.');
    [
      ['subjects', resource.subjects], ['topics', resource.topics], ['stages', resource.stages],
      ['difficulties', [resource.difficulty]], ['languages', resource.languages], ['types', [resource.type]], ['access', [resource.access]]
    ].forEach(function (pair) {
      var known = indexById(vocab[pair[0]]);
      pair[1].forEach(function (id) { if (!known[id]) errors.push('Unbekannter Wert in ' + pair[0] + ': ' + id); });
    });
    [['institutionIds', catalogue.institutions], ['maintainerIds', catalogue.maintainers]].forEach(function (pair) {
      var known = indexById(pair[1]);
      resource[pair[0]].forEach(function (id) { if (!known[id]) errors.push('Unbekannte Zuordnung in ' + pair[0] + ': ' + id); });
    });
    resource.sourceUrls.forEach(function (url) { if (!validUrl(url)) errors.push('Ungültiger Quellenlink.'); });
    if (resource.reviewedAt && !/^\d{4}-\d{2}-\d{2}$/.test(resource.reviewedAt)) errors.push('Prüfdatum muss YYYY-MM-DD entsprechen.');
    if (resource.parentId) {
      if (resource.parentId === resource.id) errors.push('Eine Ressource kann nicht ihr eigener übergeordneter Eintrag sein.');
      else if (!(catalogue.resources || []).some(function (r) { return r.id === resource.parentId; })) errors.push('Übergeordnete Ressource fehlt.');
    }
    return errors;
  }
  function findInvitation(code, invitations, hashCode, now) {
    var token = text(code);
    if (!/^mt_[a-f0-9]{64}$/.test(token)) return null;
    var digest = hashCode(token);
    return (invitations || []).find(function (invitation) {
      if (!active(invitation.active) || text(invitation.code_hash) !== digest) return false;
      var until = text(invitation.expires_at);
      return !until || (!isNaN(Date.parse(until)) && Date.parse(until) > Date.parse(now));
    }) || null;
  }
  function decideSubmission(fields, invitations, hashCode, catalogue, now, newId) {
    var correctionId = text(fields.resource_id), existing = (catalogue.resources || []).find(function (r) { return r.id === correctionId; });
    var invitation = findInvitation(fields.invitation_code, invitations, hashCode, now);
    var row = {};
    RESOURCE_COLUMNS.forEach(function (key) { row[key] = fields[key] === undefined ? '' : fields[key]; });
    row.id = correctionId || newId;
    row.reviewed_at = now.slice(0, 10);
    row.status = 'Freigegeben';
    var resource = resourceFromRow(row), errors = validateResource(resource, catalogue);
    if (correctionId && !existing) errors.push('Die Ressourcen-ID der Korrektur existiert nicht.');
    if (!correctionId && (catalogue.resources || []).some(function (r) { return text(r.url).replace(/\/$/, '') === resource.url.replace(/\/$/, ''); })) {
      errors.push('Dieser Link ist bereits vorhanden. Bitte als Korrektur mit Ressourcen-ID einreichen.');
    }
    return {
      resource: resource, errors: errors, kind: correctionId ? 'correction' : 'new',
      approval: errors.length ? 'Fehler' : invitation ? 'Freigegeben' : 'Offen',
      trusted: Boolean(invitation), invitationId: invitation ? text(invitation.invitation_id) : '',
      contributor: invitation ? text(invitation.label) : '',
      // No raw code, hash, email, user-controlled role or arbitrary extra property is returned.
      source: invitation ? 'invitation' : 'public'
    };
  }
  function vocabularyFromRows(rows) {
    var vocab = {};
    FACETS.forEach(function (facet) { vocab[facet] = []; });
    (rows || []).forEach(function (row) {
      var facet = text(row.facet);
      if (!vocab[facet]) throw new Error('Unbekannte Kategoriegruppe: ' + facet);
      var entry = { id: text(row.id), label: localized(row.label_de, row.label_en), aliases: list(row.aliases) };
      if (text(row.parent_id)) entry.parentId = text(row.parent_id);
      if (!validId(entry.id) || !entry.label.de || !entry.label.en) throw new Error('Kategorie benötigt ID und beide Sprachlabels.');
      if (vocab[facet].some(function (v) { return v.id === entry.id; })) throw new Error('Doppelte Kategorie-ID: ' + entry.id);
      vocab[facet].push(entry);
    });
    var hierarchy = vocab.subjects.concat(vocab.topics);
    assertUnique(hierarchy, 'Fächer und Themen');
    var nodes = indexById(hierarchy);
    FACETS.forEach(function (facet) {
      vocab[facet].forEach(function (entry) {
        if (entry.parentId && !nodes[entry.parentId]) throw new Error('Unbekannte übergeordnete Kategorie: ' + entry.id);
      });
    });
    hierarchy.forEach(function (entry) {
      var seen = Object.create(null), cursor = entry;
      while (cursor) {
        if (seen[cursor.id]) throw new Error('Kreis in der Kategorien-Hierarchie: ' + entry.id);
        seen[cursor.id] = true;
        cursor = nodes[cursor.parentId];
      }
    });
    return vocab;
  }
  function assertUnique(values, label) {
    var seen = Object.create(null);
    values.forEach(function (v) {
      if (!validId(v.id) || seen[v.id]) throw new Error(label + ': ungültige oder doppelte ID ' + v.id);
      seen[v.id] = true;
    });
  }
  function buildPublicCatalogue(tables, now) {
    var output = {
      schemaVersion: 1,
      meta: { title: 'Musiktheorie', updatedAt: now, source: 'google-sheets' },
      vocab: vocabularyFromRows(tables.vocabulary),
      institutions: (tables.institutions || []).map(function (r) {
        var entry = { id: text(r.id), name: localized(r.name_de, r.name_en), shortName: text(r.short_name), url: text(r.url), aliases: list(r.aliases) };
        if ((!entry.name.de && !entry.name.en) || (entry.url && !validUrl(entry.url))) throw new Error('Institution benötigt Namen und einen gültigen optionalen Link.');
        return entry;
      }),
      maintainers: (tables.maintainers || []).map(function (r) {
        var entry = { id: text(r.id), name: text(r.name), url: text(r.url) };
        if (!entry.name || (entry.url && !validUrl(entry.url))) throw new Error('Betreuung benötigt Namen und einen gültigen optionalen Link.');
        return entry;
      }),
      resources: (tables.resources || []).filter(function (r) { return published(r.status); }).map(resourceFromRow),
      collections: []
    };
    assertUnique(output.institutions, 'Institutionen');
    assertUnique(output.maintainers, 'Betreuung');
    assertUnique(output.resources, 'Ressourcen');
    output.resources.forEach(function (resource) {
      var errors = validateResource(resource, output);
      if (errors.length) throw new Error(resource.id + ': ' + errors.join(' '));
    });
    var resourceIds = indexById(output.resources);
    output.collections = (tables.collections || []).filter(function (r) { return published(r.status); }).map(function (row) {
      var id = text(row.id), title = localized(row.title_de, row.title_en);
      if (!title.de && !title.en) throw new Error('Sammlung benötigt einen Titel: ' + id);
      var members = (tables.collectionItems || []).filter(function (r) { return text(r.collection_id) === id; }).map(function (r, index) {
        var order = Number(r.position);
        if (!isFinite(order)) throw new Error('Ungültige Reihenfolge in Sammlung ' + id);
        return { resourceId: text(r.resource_id), note: localized(r.note_de, r.note_en), position: order, index: index };
      }).sort(function (a, b) { return a.position - b.position || a.index - b.index; });
      var seen = Object.create(null);
      members.forEach(function (item) {
        if (!resourceIds[item.resourceId]) throw new Error('Sammlung ' + id + ' verweist auf nicht veröffentlichte Ressource: ' + item.resourceId);
        if (seen[item.resourceId]) throw new Error('Doppelte Ressource in Sammlung ' + id);
        seen[item.resourceId] = true;
      });
      return { id: id, title: title, description: localized(row.description_de, row.description_en), curator: text(row.curator), items: members.map(function (m) { return { resourceId: m.resourceId, note: m.note }; }) };
    });
    assertUnique(output.collections, 'Sammlungen');
    // Whitelist construction above deliberately excludes inbox, invitations and all private columns.
    return output;
  }
  function seedTables(catalogue) {
    var tables = { resources: (catalogue.resources || []).map(rowFromResource), vocabulary: [], institutions: [], maintainers: [], collections: [], collectionItems: [] };
    FACETS.forEach(function (facet) {
      ((catalogue.vocab || {})[facet] || []).forEach(function (r) { tables.vocabulary.push({ facet: facet, id: r.id, label_de: r.label.de, label_en: r.label.en, aliases: list(r.aliases).join('; '), parent_id: r.parentId || '' }); });
    });
    (catalogue.institutions || []).forEach(function (r) { tables.institutions.push({ id: r.id, name_de: r.name.de, name_en: r.name.en, short_name: r.shortName || '', url: r.url || '', aliases: list(r.aliases).join('; ') }); });
    (catalogue.maintainers || []).forEach(function (r) { tables.maintainers.push({ id: r.id, name: r.name, url: r.url || '' }); });
    (catalogue.collections || []).forEach(function (r) {
      tables.collections.push({ id: r.id, title_de: r.title.de, title_en: r.title.en, description_de: r.description.de, description_en: r.description.en, curator: r.curator || '', status: 'Freigegeben' });
      (r.items || []).forEach(function (item, index) { tables.collectionItems.push({ collection_id: r.id, resource_id: item.resourceId, position: (index + 1) * 10, note_de: (item.note || {}).de || '', note_en: (item.note || {}).en || '' }); });
    });
    return tables;
  }
  return {
    FACETS: FACETS, RESOURCE_COLUMNS: RESOURCE_COLUMNS, text: text, list: list, choiceId: choiceId,
    validId: validId, validUrl: validUrl, active: active, published: published, literalCell: literalCell,
    rowFromResource: rowFromResource, resourceFromRow: resourceFromRow, validateResource: validateResource,
    findInvitation: findInvitation, decideSubmission: decideSubmission, buildPublicCatalogue: buildPublicCatalogue, seedTables: seedTables
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CatalogueCore;
