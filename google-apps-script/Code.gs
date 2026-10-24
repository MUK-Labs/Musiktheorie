/**
 * Musiktheorie: private Forms/Sheets intake and one-way GitHub publication.
 * Install Core.gs beside this file. See docs/google-setup.md before running setup().
 * Contributors never authorize this script; the administrator installs its triggers.
 */
var MT_DEFAULT_REPOSITORY = 'MUK-Labs/Musiktheorie';
var MT_RESOURCE_FIELDS = [
  ['id','ID'], ['title','Titel'], ['url','Link'], ['description_de','Beschreibung DE'], ['description_en','Beschreibung EN'],
  ['subjects','Fächer'], ['topics','Themen'], ['stages','Bildungsbereiche'], ['difficulty','Schwierigkeit'], ['languages','Sprachen'],
  ['type','Format'], ['institution_ids','Institutionen'], ['maintainer_ids','Betreuung'], ['authors','Autorinnen und Autoren'],
  ['access','Zugang'], ['license','Lizenz'], ['prerequisites_de','Voraussetzungen DE'], ['prerequisites_en','Voraussetzungen EN'],
  ['reviewed_at','Zuletzt geprüft'], ['source_urls','Quellenlinks'], ['status','Status'], ['parent_id','Übergeordnete ID']
];
var MT_TABLES = {
  resources: { name: 'Ressourcen', columns: MT_RESOURCE_FIELDS },
  vocabulary: { name: 'Kategorien', columns: [['facet','Gruppe'],['id','ID'],['label_de','Bezeichnung DE'],['label_en','Bezeichnung EN'],['aliases','Suchbegriffe'],['parent_id','Übergeordnete ID']] },
  institutions: { name: 'Institutionen', columns: [['id','ID'],['name_de','Name DE'],['name_en','Name EN'],['short_name','Kurzname'],['url','Website'],['aliases','Suchbegriffe']] },
  maintainers: { name: 'Betreuung', columns: [['id','ID'],['name','Name'],['url','Profil oder Website']] },
  collections: { name: 'Sammlungen', columns: [['id','ID'],['title_de','Titel DE'],['title_en','Titel EN'],['description_de','Beschreibung DE'],['description_en','Beschreibung EN'],['curator','Zusammengestellt von'],['status','Status']] },
  collectionItems: { name: 'Sammlungseinträge', columns: [['collection_id','Sammlungs-ID'],['resource_id','Ressourcen-ID'],['position','Reihenfolge'],['note_de','Hinweis DE'],['note_en','Hinweis EN']] },
  inbox: { name: 'Eingang', columns: [['submission_id','Eingangs-ID'],['received_at','Eingegangen'],['decision','Entscheidung'],['diagnostic','Hinweis'],['source','Herkunft'],['contributor','Einladung für'],['invitation_id','Einladungs-ID'],['kind','Art'],['contact','Rückfragekontakt (privat)'],['internal_note','Notiz (privat)']].concat(MT_RESOURCE_FIELDS) },
  invitations: { name: 'Einladungen', columns: [['invitation_id','ID'],['label','Für'],['code_hash','Code-Prüfsumme (privat)'],['active','Aktiv'],['created_at','Erstellt'],['expires_at','Gültig bis (optional)'],['last_used_at','Zuletzt verwendet'],['use_count','Verwendungen']] },
  settings: { name: 'Status', columns: [['key','Einstellung'],['value','Wert']] }
};

function mtProps_() { return PropertiesService.getScriptProperties(); }
function mtBook_() {
  var id = mtProps_().getProperty('CATALOGUE_SPREADSHEET_ID');
  if (!id) throw new Error('Bitte zuerst setup() ausführen.');
  return SpreadsheetApp.openById(id);
}
function mtNow_() { return new Date().toISOString(); }
function mtId_(prefix) { return prefix + Utilities.getUuid().toLowerCase(); }
function mtHash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function mtRead_(key) {
  var table = MT_TABLES[key], sheet = mtBook_().getSheetByName(table.name);
  if (!sheet) throw new Error('Tab fehlt: ' + table.name);
  var headers = sheet.getRange(1,1,1,table.columns.length).getDisplayValues()[0];
  if (headers.join('\u001f') !== table.columns.map(function (c) { return c[1]; }).join('\u001f')) throw new Error('Spaltenüberschriften in ' + table.name + ' wurden verändert. Bitte wiederherstellen.');
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,table.columns.length).getDisplayValues().map(function (values, index) {
    var row = { _row: index + 2 };
    table.columns.forEach(function (column, i) { row[column[0]] = values[i]; });
    return row;
  }).filter(function (row) { return table.columns.some(function (c) { return String(row[c[0]]).trim() !== ''; }); });
}
function mtWrite_(key, row, rowNumber) {
  var table = MT_TABLES[key], sheet = mtBook_().getSheetByName(table.name);
  var values = table.columns.map(function (column) { return CatalogueCore.literalCell(row[column[0]]); });
  var target = rowNumber || sheet.getLastRow() + 1;
  if (target>sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(),Math.max(100,target-sheet.getMaxRows()));
  sheet.getRange(target,1,1,values.length).setNumberFormat('@').setValues([values]);
  return target;
}
function mtSetting_(key, value) {
  var row = mtRead_('settings').find(function (r) { return r.key === key; });
  mtWrite_('settings',{key:key,value:value},row && row._row);
}
function mtTables_() {
  var tables = {};
  ['resources','vocabulary','institutions','maintainers','collections','collectionItems'].forEach(function (key) { tables[key] = mtRead_(key); });
  return tables;
}
function mtSnapshot_() { return CatalogueCore.buildPublicCatalogue(mtTables_(), mtNow_()); }
function mtEscape_(text) { return String(text).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function mtDialog_(title, message) {
  var html = '<div style="font:15px/1.5 system-ui;padding:10px"><p>' + mtEscape_(message).replace(/\n/g,'<br>') + '</p></div>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(580).setHeight(320), title);
}
function mtEnsureSheet_(book, key) {
  var table = MT_TABLES[key], sheet = book.getSheetByName(table.name) || book.insertSheet(table.name);
  if (sheet.getMaxColumns() < table.columns.length) sheet.insertColumnsAfter(sheet.getMaxColumns(),table.columns.length-sheet.getMaxColumns());
  if (!sheet.getLastRow()) {
    sheet.getRange(1,1,1,table.columns.length).setValues([table.columns.map(function (c) { return c[1]; })]);
    sheet.getRange(1,1,1,table.columns.length).setBackground('#352735').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1,table.columns.length,170);
    sheet.getRange(1,1,1,table.columns.length).setNotes([table.columns.map(function (c) { return 'Technischer Feldname: ' + c[0] + '. Überschrift bitte nicht umbenennen. Mehrfachwerte mit Semikolon trennen.'; })]);
  }
  return sheet;
}
function mtSeedEmptyTable_(key, rows) {
  if (!rows.length || mtRead_(key).length) return;
  var table=MT_TABLES[key], sheet=mtBook_().getSheetByName(table.name);
  if (sheet.getMaxRows()<rows.length+1) sheet.insertRowsAfter(sheet.getMaxRows(),rows.length+1-sheet.getMaxRows());
  var values=rows.map(function (row) { return table.columns.map(function (column) { return CatalogueCore.literalCell(row[column[0]]); }); });
  // One range write per empty tab avoids leaving a partially imported sequence of rows.
  sheet.getRange(2,1,values.length,table.columns.length).setNumberFormat('@').setValues(values);
}

/** Run once from a blank Sheet's bound Apps Script project. Safe to run again. */
function setup() {
  var props = mtProps_(), book;
  if (props.getProperty('CATALOGUE_SPREADSHEET_ID')) book = mtBook_();
  else {
    book = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.create('Musiktheorie – Redaktion');
    props.setProperty('CATALOGUE_SPREADSHEET_ID',book.getId());
  }
  Object.keys(MT_TABLES).forEach(function (key) { mtEnsureSheet_(book,key); });
  if (!props.getProperty('GITHUB_REPOSITORY')) props.setProperty('GITHUB_REPOSITORY',MT_DEFAULT_REPOSITORY);
  if (!props.getProperty('SEED_COMPLETE')) {
    var response = UrlFetchApp.fetch('https://raw.githubusercontent.com/MUK-Labs/Musiktheorie/main/data/catalogue.json',{muteHttpExceptions:true});
    if (response.getResponseCode() !== 200) throw new Error('Startkatalog noch nicht erreichbar. setup() nach Veröffentlichung des Repositorys erneut ausführen; vorhandene Daten bleiben erhalten.');
    var seed = JSON.parse(response.getContentText()), tables = CatalogueCore.seedTables(seed);
    CatalogueCore.buildPublicCatalogue(tables,mtNow_());
    Object.keys(tables).forEach(function (key) {
      // Each tab is filled only while empty. Rerunning never replaces editorial rows.
      mtSeedEmptyTable_(key,tables[key]);
    });
    props.setProperty('SEED_COMPLETE','true');
  }
  var form;
  if (props.getProperty('CATALOGUE_FORM_ID')) form = FormApp.openById(props.getProperty('CATALOGUE_FORM_ID'));
  else {
    form = FormApp.create('Musiktheorie · Ressource vorschlagen / Suggest a resource');
    props.setProperty('CATALOGUE_FORM_ID',form.getId());
  }
  form.setDescription('Musiktheorie-Ressourcen für Lernen und Lehre / Music-theory resources for learning and teaching.\nÖffentliche Vorschläge werden geprüft. Gültige persönliche Einladungscodes ermöglichen die direkte Veröffentlichung. / Public suggestions are reviewed. Valid personal invitation codes enable publication without editorial review.');
  form.setCollectEmail(false).setLimitOneResponsePerUser(false).setAllowResponseEdits(false).setPublishingSummary(false).setShowLinkToRespondAgain(true);
  form.setConfirmationMessage('Danke / Thank you! Ein gültiger Einladungscode ermöglicht die automatische Übernahme vollständiger Angaben. Andere Vorschläge werden redaktionell geprüft. Sichtbar nach der nächsten erfolgreichen Website-Aktualisierung. / A valid invitation code allows automatic acceptance of complete entries. Other suggestions are reviewed. Accepted entries appear after the next successful website update.');
  if (form.supportsAdvancedResponderPermissions()) form.setPublished(true);
  else form.setAcceptingResponses(true);
  // Responder access policy must be set and tested by the owner; deprecated setRequireLogin is not used.
  refreshFormChoices();
  mtEnsureTrigger_('catalogueOnFormSubmit','form',form.getId());
  mtEnsureTrigger_('catalogueOnEdit','sheet',book.getId());
  mtEnsureTrigger_('catalogueOnOpen','open',book.getId());
  mtApplyValidation_();
  mtSetting_('Redaktionsdatei',book.getUrl());
  mtSetting_('Formular bearbeiten',form.getEditUrl());
  mtSetting_('Öffentlicher Formularlink',form.getPublishedUrl());
  mtSetting_('Repository',props.getProperty('GITHUB_REPOSITORY'));
  mtSetting_('Nächster Schritt','Formular-Zugriff „Jeder mit dem Link“ einstellen und abgemeldet testen. Danach Menü: Anmeldung-freien Zugang bestätigen. GitHub-Token als Script Property setzen.');
  if (!props.getProperty('LAST_PUBLISHED_AT')) mtSetting_('Veröffentlichung','Google-Einrichtung vorbereitet; Verbindung noch nicht aktiviert.');
  onOpen();
  return { spreadsheetUrl:book.getUrl(), formEditUrl:form.getEditUrl(), publicFormUrl:form.getPublishedUrl() };
}
function mtEnsureTrigger_(handler, type, id) {
  var existing = ScriptApp.getProjectTriggers().some(function (trigger) { return trigger.getHandlerFunction() === handler && trigger.getTriggerSourceId() === id; });
  if (existing) return;
  var trigger = ScriptApp.newTrigger(handler);
  if (type === 'form') trigger.forForm(id).onFormSubmit().create();
  else if (type === 'open') trigger.forSpreadsheet(id).onOpen().create();
  else trigger.forSpreadsheet(id).onEdit().create();
}
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('Musiktheorie')
      .addItem('Ausgewählte Vorschläge freigeben','approveSelectedSubmissions')
      .addItem('Ausgewählte Vorschläge ablehnen','rejectSelectedSubmissions')
      .addItem('Letzte Formulareingänge nachholen','recoverRecentSubmissions')
      .addSeparator().addItem('Jetzt veröffentlichen','publishCatalogue')
      .addItem('Formular-Auswahl aktualisieren','refreshFormChoices')
      .addSeparator().addItem('Persönliche Einladung erstellen','createInvitation')
      .addItem('Ausgewählte Einladung sperren','revokeSelectedInvitation')
      .addSeparator().addItem('Anmeldung-freien Zugang bestätigen','confirmAnonymousAccess')
      .addItem('Einrichtungsstatus anzeigen','showSetupStatus').addToUi();
  } catch (error) { /* Standalone projects can run setup, but menus require the bound-sheet installation. */ }
}
function catalogueOnOpen() { onOpen(); }
function mtApplyValidation_() {
  [['resources','status',['Entwurf','Freigegeben','Archiviert']],['collections','status',['Entwurf','Freigegeben','Archiviert']],['inbox','decision',['Offen','Freigegeben','Übernommen','Abgelehnt','Fehler']],['invitations','active',['true','false']]].forEach(function (spec) {
    var table=MT_TABLES[spec[0]], sheet=mtBook_().getSheetByName(table.name), column=table.columns.findIndex(function (c) { return c[0]===spec[1]; })+1;
    sheet.getRange(2,column,sheet.getMaxRows()-1,1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(spec[2],true).setAllowInvalid(false).build());
  });
}
function mtFormDefinitions_(catalogue) {
  function vocab(facet) { return (catalogue.vocab[facet] || []).map(function (v) { return v.label.de + ' / ' + v.label.en + ' [' + v.id + ']'; }); }
  return [
    {key:'resource_id',title:'Ressourcen-ID bei Korrektur / Resource ID for a correction',help:'Bei neuen Ressourcen leer lassen. Bei Korrekturen alle Angaben vollständig eintragen. / Leave empty for a new resource. For corrections, provide the complete revised entry.'},
    {key:'title',title:'Titel / Title',required:true},
    {key:'url',title:'Link / URL',required:true,url:true},
    {key:'description_de',title:'Beschreibung auf Deutsch',paragraph:true,help:'Mindestens eine Beschreibung auf Deutsch oder Englisch ist erforderlich. / At least one German or English description is required.'},
    {key:'description_en',title:'Description in English',paragraph:true},
    {key:'subjects',title:'Fächer / Subjects',options:vocab('subjects'),multiple:true,required:true},
    {key:'topics',title:'Themen / Topics',options:vocab('topics'),multiple:true},
    {key:'stages',title:'Bildungsbereiche / Educational contexts',options:vocab('stages'),multiple:true},
    {key:'difficulty',title:'Schwierigkeit / Difficulty',options:vocab('difficulties'),required:true},
    {key:'languages',title:'Sprachen der Ressource / Resource languages',options:vocab('languages'),multiple:true,required:true},
    {key:'type',title:'Format / Resource type',options:vocab('types'),required:true},
    {key:'institution_ids',title:'Institutionen / Institutions',options:catalogue.institutions.map(function (v) { return (v.shortName || v.name.de || v.name.en) + ' [' + v.id + ']'; }),multiple:true},
    {key:'maintainer_ids',title:'Betreuung / Maintainers',options:catalogue.maintainers.map(function (v) { return v.name + ' [' + v.id + ']'; }),multiple:true},
    {key:'authors',title:'Autorinnen und Autoren / Authors',help:'Mehrere Namen mit Semikolon trennen. / Separate names with semicolons.'},
    {key:'access',title:'Zugang / Access',options:vocab('access'),required:true},
    {key:'license',title:'Lizenz, falls bekannt / Licence, if known'},
    {key:'prerequisites_de',title:'Voraussetzungen DE / Prerequisites in German',paragraph:true},
    {key:'prerequisites_en',title:'Prerequisites in English',paragraph:true},
    {key:'source_urls',title:'Quellenlinks / Sources',paragraph:true,help:'Optional: Nachweise für Betreuung und institutionelle Zuordnung; ein Link pro Zeile. / Optional evidence for attribution; one link per line.'},
    {key:'parent_id',title:'Übergeordnete Ressourcen-ID / Parent resource ID (optional)'},
    {key:'contact',title:'Rückfragekontakt (privat, optional) / Contact for questions (private, optional)'},
    {key:'internal_note',title:'Nachricht an die Redaktion (privat) / Note to editors (private)',paragraph:true,help:'Neue Institutionen oder Betreuungspersonen bitte hier nennen, falls sie in der Auswahl fehlen. / Mention any institution or maintainer missing from the choices here.'},
    {key:'invitation_code',title:'Persönlicher Einladungscode (optional) / Personal invitation code (optional)',help:'Bei einem persönlichen Einladungslink bereits ausgefüllt. Ohne gültigen Code wird der Vorschlag geprüft. / Prefilled in a personal invitation link. Without a valid code, the suggestion is reviewed.'}
  ];
}
function refreshFormChoices() {
  var props=mtProps_(), form=FormApp.openById(props.getProperty('CATALOGUE_FORM_ID'));
  var map=JSON.parse(props.getProperty('FORM_FIELD_IDS') || '{}');
  mtFormDefinitions_(mtSnapshot_()).forEach(function (def) {
    var item=null;
    // A manually deleted question can be recreated without discarding other question IDs.
    if (map[def.key]) {
      try { item=form.getItemById(Number(map[def.key])); } catch (error) { item=null; }
    }
    if (item) item=def.options ? (def.multiple ? item.asCheckboxItem() : item.asListItem()) : def.paragraph ? item.asParagraphTextItem() : item.asTextItem();
    else {
      item=def.options ? (def.multiple ? form.addCheckboxItem() : form.addListItem()) : def.paragraph ? form.addParagraphTextItem() : form.addTextItem();
      map[def.key]=item.getId();
      props.setProperty('FORM_FIELD_IDS',JSON.stringify(map));
    }
    item.setTitle(def.title).setRequired(Boolean(def.required));
    if (def.help) item.setHelpText(def.help);
    if (def.options) item.setChoiceValues(def.options.length ? def.options : ['Keine Zuordnung / None']);
    if (def.url) item.setValidation(FormApp.createTextValidation().requireTextIsUrl().setHelpText('Bitte einen vollständigen Link angeben. / Please enter a complete URL.').build());
  });
  mtSetting_('Formular-Auswahl aktualisiert',mtNow_());
}

function catalogueOnFormSubmit(event) {
  var props=mtProps_();
  if (!event || !event.response || !event.source || event.source.getId() !== props.getProperty('CATALOGUE_FORM_ID')) throw new Error('Ungültige Formularquelle.');
  var shouldPublish=false, lock=LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var submissionId=String(event.response.getId());
    var previous=mtRead_('inbox').find(function (r) { return r.submission_id===submissionId; });
    if (previous && previous.decision!=='Fehler') return;
    var map=JSON.parse(props.getProperty('FORM_FIELD_IDS') || '{}'), inverse={}, fields={};
    Object.keys(map).forEach(function (key) { inverse[String(map[key])]=key; });
    event.response.getItemResponses().forEach(function (response) {
      var key=inverse[String(response.getItem().getId())];
      if (key) fields[key]=response.getResponse();
    });
    var now=mtNow_(), invitations=mtRead_('invitations');
    var decision, proposedId=previous ? previous.id : mtId_('r-');
    try {
      decision=CatalogueCore.decideSubmission(fields,invitations,mtHash_,mtSnapshot_(),now,proposedId);
    } catch (error) {
      // Preserve the proposal even while an unrelated editorial row prevents a valid export.
      var failedRow={};
      CatalogueCore.RESOURCE_COLUMNS.forEach(function (key) { failedRow[key]=fields[key]||''; });
      failedRow.id=CatalogueCore.text(fields.resource_id)||proposedId;
      failedRow.reviewed_at=now.slice(0,10);
      decision={resource:CatalogueCore.resourceFromRow(failedRow),approval:'Fehler',source:'public',contributor:'',invitationId:'',kind:fields.resource_id?'correction':'new',errors:['Eingang gespeichert; Katalogfehler zuerst beheben und anschließend Formulareingänge nachholen: '+String(error.message||error)]};
    }
    var inbox=CatalogueCore.rowFromResource(decision.resource);
    inbox.submission_id=submissionId; inbox.received_at=now; inbox.decision=decision.approval;
    inbox.diagnostic=decision.errors.join(' '); inbox.source=decision.source; inbox.kind=decision.kind;
    inbox.contributor=decision.contributor; inbox.invitation_id=decision.invitationId;
    inbox.contact=CatalogueCore.text(fields.contact); inbox.internal_note=CatalogueCore.text(fields.internal_note);
    var rowNumber=mtWrite_('inbox',inbox,previous && previous._row);
    if (decision.approval==='Freigegeben') {
      shouldPublish=mtAcceptInbox_(inbox,rowNumber);
      if (shouldPublish) {
        var invitation=invitations.find(function (r) { return r.invitation_id===decision.invitationId; });
        invitation.last_used_at=now; invitation.use_count=String((Number(invitation.use_count)||0)+1);
        mtWrite_('invitations',invitation,invitation._row);
      }
    }
  } finally { lock.releaseLock(); }
  if (shouldPublish) mtTryPublish_();
}
function recoverRecentSubmissions() {
  var form=FormApp.openById(mtProps_().getProperty('CATALOGUE_FORM_ID'));
  // Bounded repair; the trigger deduplicates already handled response IDs.
  form.getResponses().slice(-100).forEach(function (response) { catalogueOnFormSubmit({source:form,response:response}); });
}
function mtAcceptInbox_(inbox, rowNumber) {
  var resource=CatalogueCore.resourceFromRow(inbox), catalogue=mtSnapshot_();
  var errors=CatalogueCore.validateResource(resource,catalogue), current=mtRead_('resources').find(function (r) { return r.id===resource.id; });
  if (inbox.kind==='correction' && !current) errors.push('Zu korrigierende Ressource fehlt.');
  if (inbox.kind!=='correction' && current) errors.push('Diese Ressourcen-ID existiert bereits.');
  if (errors.length) {
    inbox.decision='Fehler'; inbox.diagnostic=errors.join(' '); mtWrite_('inbox',inbox,rowNumber); return false;
  }
  var row=CatalogueCore.rowFromResource(resource);
  row.reviewed_at=mtNow_().slice(0,10); row.status='Freigegeben';
  mtWrite_('resources',row,current && current._row);
  inbox.decision='Übernommen'; inbox.diagnostic='In den Katalog übernommen; Veröffentlichung folgt.';
  mtWrite_('inbox',inbox,rowNumber);
  mtProps_().setProperty('PUBLICATION_PENDING','true');
  return true;
}
function mtSelectedRows_(key) {
  var sheet=SpreadsheetApp.getActiveSheet(), range=SpreadsheetApp.getActiveRange();
  if (!sheet || sheet.getName()!==MT_TABLES[key].name || !range) throw new Error('Bitte zuerst Zeilen im Tab '+MT_TABLES[key].name+' auswählen.');
  var first=Math.max(2,range.getRow()), last=range.getLastRow();
  return mtRead_(key).filter(function (r) { return r._row>=first && r._row<=last; });
}
function approveSelectedSubmissions() {
  var rows=mtSelectedRows_('inbox'), lock=LockService.getScriptLock(), changed=false;
  lock.waitLock(30000);
  try { rows.forEach(function (row) { if (row.decision!=='Übernommen') changed=mtAcceptInbox_(row,row._row)||changed; }); }
  finally { lock.releaseLock(); }
  if (changed) publishCatalogue();
}
function rejectSelectedSubmissions() {
  mtSelectedRows_('inbox').forEach(function (row) {
    if (row.decision==='Übernommen') return;
    row.decision='Abgelehnt'; mtWrite_('inbox',row,row._row);
  });
}
function catalogueOnEdit(event) {
  if (!event || !event.source || event.source.getId()!==mtProps_().getProperty('CATALOGUE_SPREADSHEET_ID')) return;
  var name=event.range.getSheet().getName(), changed=false;
  if (name===MT_TABLES.inbox.name) {
    var decisionColumn=MT_TABLES.inbox.columns.findIndex(function (c) { return c[0]==='decision'; })+1;
    if (event.range.getColumn()>decisionColumn || event.range.getLastColumn()<decisionColumn) return;
    var lock=LockService.getScriptLock(); lock.waitLock(30000);
    try { mtRead_('inbox').filter(function (r) { return r._row>=event.range.getRow() && r._row<=event.range.getLastRow() && r.decision==='Freigegeben'; }).forEach(function (r) { changed=mtAcceptInbox_(r,r._row)||changed; }); }
    finally { lock.releaseLock(); }
  } else {
    var key=['resources','vocabulary','institutions','maintainers','collections','collectionItems'].find(function (k) { return MT_TABLES[k].name===name; });
    if (!key) return;
    changed=true;
  }
  if (changed) { mtProps_().setProperty('PUBLICATION_PENDING','true'); mtTryPublish_(); }
}

function createInvitation() {
  var ui=SpreadsheetApp.getUi(), answer=ui.prompt('Persönliche Einladung','Name oder Kürzel (nur für die interne Zuordnung):',ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton()!==ui.Button.OK) return;
  var label=answer.getResponseText().trim();
  if (!label) throw new Error('Bitte einen Namen oder ein Kürzel angeben.');
  var token=('mt_'+Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'')).toLowerCase();
  var invitation={invitation_id:mtId_('i-'),label:label,code_hash:mtHash_(token),active:'true',created_at:mtNow_(),expires_at:'',last_used_at:'',use_count:'0'};
  var props=mtProps_(), form=FormApp.openById(props.getProperty('CATALOGUE_FORM_ID'));
  var map=JSON.parse(props.getProperty('FORM_FIELD_IDS')), item=form.getItemById(Number(map.invitation_code)).asTextItem();
  var link=form.createResponse().withItemResponse(item.createResponse(token)).toPrefilledUrl();
  mtWrite_('invitations',invitation);
  var html='<div style="font:15px/1.5 system-ui;padding:12px"><p>Einladung für <strong>'+mtEscape_(label)+'</strong>. Diesen Link jetzt kopieren und privat weitergeben. Er wird hier nicht dauerhaft gespeichert.</p><textarea style="width:100%;height:130px" readonly>'+mtEscape_(link)+'</textarea><p>Wer den Link besitzt, kann ohne Anmeldung und ohne redaktionelle Prüfung veröffentlichen. Sperren ist im Tab Einladungen möglich.</p></div>';
  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(620).setHeight(350),'Persönlicher Einladungslink');
}
function revokeSelectedInvitation() {
  mtSelectedRows_('invitations').forEach(function (row) { row.active='false'; mtWrite_('invitations',row,row._row); });
}
function confirmAnonymousAccess() {
  var ui=SpreadsheetApp.getUi(), answer=ui.alert('Zugang ohne Anmeldung geprüft?', 'Öffentlichen Formularlink in einem privaten Browserfenster öffnen und einen Test ohne Google-Anmeldung durchführen. Ist das möglich? Erst dann wird das Formular auf der Website verlinkt.',ui.ButtonSet.YES_NO);
  if (answer!==ui.Button.YES) return;
  mtProps_().setProperty('ANONYMOUS_ACCESS_CONFIRMED','true');
  mtSetting_('Zugang ohne Anmeldung','Durch Administrator bestätigt: '+mtNow_());
  publishCatalogue();
}
function showSetupStatus() {
  var props=mtProps_(), values=[
    'Formular ohne Anmeldung bestätigt: '+(props.getProperty('ANONYMOUS_ACCESS_CONFIRMED')==='true'?'Ja':'Noch nicht'),
    'GitHub-Verbindung konfiguriert: '+(props.getProperty('GITHUB_TOKEN')?'Ja':'Noch nicht'),
    'Letzte erfolgreiche Datenübertragung: '+(props.getProperty('LAST_PUBLISHED_AT')||'Noch keine'),
    'Details und Links: Tab Status. GitHub-Pages-Build separat prüfen.'
  ];
  mtDialog_('Einrichtungsstatus',values.join('\n'));
}
function mtRepository_() {
  var repository=mtProps_().getProperty('GITHUB_REPOSITORY')||MT_DEFAULT_REPOSITORY;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Ungültiges GITHUB_REPOSITORY.');
  return repository;
}
function mtGithub_(path, method, body) {
  var token=mtProps_().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('GITHUB_TOKEN fehlt in den Script Properties.');
  var response=UrlFetchApp.fetch('https://api.github.com/repos/'+mtRepository_()+'/contents/'+path,{
    method:method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},
    contentType:'application/json',payload:body?JSON.stringify(body):undefined,muteHttpExceptions:true
  });
  var status=response.getResponseCode();
  if (status!==200 && status!==201) throw new Error('GitHub '+method.toUpperCase()+' '+path+': HTTP '+status+'. Repository-Zugriff, Token-Berechtigung und Branch-Regeln prüfen.');
  return JSON.parse(response.getContentText());
}
function mtUpdateCatalogue_(snapshot) {
  var current=mtGithub_('data/catalogue.json','get');
  var old=JSON.parse(Utilities.newBlob(Utilities.base64Decode(current.content.replace(/\s/g,''))).getDataAsString('UTF-8'));
  var comparison=JSON.parse(JSON.stringify(snapshot));
  if (old.meta && old.meta.updatedAt) comparison.meta.updatedAt=old.meta.updatedAt;
  if (JSON.stringify(comparison)===JSON.stringify(old)) return old.meta.updatedAt;
  mtGithub_('data/catalogue.json','put',{message:'Publish reviewed music-theory catalogue from Google Sheets',content:Utilities.base64Encode(JSON.stringify(snapshot,null,2)+'\n',Utilities.Charset.UTF_8),sha:current.sha,branch:'main'});
  return snapshot.meta.updatedAt;
}
function mtTryPublish_() {
  try { publishCatalogue(); }
  catch (error) {
    // No raw form payload, invitation or credentials are logged.
    mtSetting_('Veröffentlichung','Ausstehend – siehe Fehler. Die letzte veröffentlichte Version bleibt online.');
    mtSetting_('Letzter Fehler',String(error.message||error));
  }
}
function publishCatalogue() {
  var lock=LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Eine Veröffentlichung läuft bereits. Bitte gleich erneut versuchen.');
  try {
    var props=mtProps_();
    if (!props.getProperty('GITHUB_TOKEN')) throw new Error('Google ist eingerichtet. Für die Website-Verbindung fehlt noch GITHUB_TOKEN in den Script Properties.');
    var snapshot=mtSnapshot_();
    if (!snapshot.resources.length && props.getProperty('ALLOW_EMPTY_CATALOGUE')!=='true') throw new Error('Leerer Katalog wird nicht veröffentlicht. Für eine absichtliche Leerung ALLOW_EMPTY_CATALOGUE=true setzen.');
    mtSetting_('Veröffentlichung','Daten werden geprüft und übertragen …');
    var publishedAt=mtUpdateCatalogue_(snapshot);
    if (props.getProperty('ANONYMOUS_ACCESS_CONFIRMED')==='true') {
      var current=mtGithub_('config.json','get');
      var config=JSON.parse(Utilities.newBlob(Utilities.base64Decode(current.content.replace(/\s/g,''))).getDataAsString('UTF-8'));
      var formUrl=FormApp.openById(props.getProperty('CATALOGUE_FORM_ID')).getPublishedUrl();
      if (config.formUrl!==formUrl) {
        config.formUrl=formUrl;
        mtGithub_('config.json','put',{message:'Connect public contribution form',content:Utilities.base64Encode(JSON.stringify(config,null,2)+'\n',Utilities.Charset.UTF_8),sha:current.sha,branch:'main'});
      }
    }
    props.setProperty('LAST_PUBLISHED_AT',publishedAt);
    props.deleteProperty('PUBLICATION_PENDING');
    mtSetting_('Letzte erfolgreiche Datenübertragung',publishedAt);
    mtSetting_('Letzter Fehler','');
    mtSetting_('Veröffentlichung','An GitHub übertragen. Website folgt nach erfolgreichem Pages-Build.');
    mtSetting_('Build-Status','https://github.com/'+mtRepository_()+'/actions');
    return {updatedAt:publishedAt,resources:snapshot.resources.length};
  } catch (error) {
    mtProps_().setProperty('PUBLICATION_PENDING','true');
    mtSetting_('Veröffentlichung','Ausstehend. Letzte Website-Version bleibt erhalten.');
    mtSetting_('Letzter Fehler',String(error.message||error));
    throw error;
  } finally { lock.releaseLock(); }
}
