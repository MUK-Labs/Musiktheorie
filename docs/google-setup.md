# Google Forms und Sheets einmalig verbinden

Diese Einrichtung übernimmt eine verantwortliche Administratorin oder ein Administrator. **Beitragende benötigen anschließend weder ein Google-Konto noch einen GitHub-Zugang.**

Der Code ist vorbereitet und seine entscheidenden Daten- und Freigaberegeln sind mit Node getestet. Ein echtes Formular, eine Google-Datei, persönliche Einladungen und die GitHub-Verbindung werden erst im Konto der verantwortlichen Person eingerichtet. Eine erfolgreiche lokale Prüfung ersetzt diesen einmaligen Live-Test nicht.

## Arbeitsweise

- Ein öffentliches, zweisprachiges Google-Formular nimmt neue Ressourcen und Korrekturen entgegen.
- Ein gültiger persönlicher Einladungscode bewirkt die automatische Übernahme; es gibt dabei keine menschliche Freigabe.
- Ohne gültigen Code bleibt ein Vorschlag im privaten Tab **Eingang**.
- **Ressourcen**, **Kategorien**, **Institutionen**, **Betreuung**, **Sammlungen** und **Sammlungseinträge** sind die redaktionelle Datenquelle.
- Ein Export enthält ausschließlich freigegebene Datensätze und öffentliche Felder. Er aktualisiert `data/catalogue.json` im Repository. Der normale Pages-Workflow veröffentlicht anschließend die Website.
- Einladungen, Code-Prüfsummen, Rückfragekontakte und interne Hinweise gelangen nicht in diesen Export. Änderungen in GitHub werden nach der Google-Einrichtung nicht automatisch zurück in Sheets synchronisiert.

## 1. Private Redaktionsdatei anlegen

1. Mit dem Google-Konto anmelden, unter dem die Redaktion langfristig betrieben werden soll.
2. Eine **leere Google-Tabelle** namens „Musiktheorie – Redaktion“ anlegen. Die Datei nur mit verantwortlichen Redaktionsmitgliedern teilen; keine öffentliche Linkfreigabe einschalten.
3. **Erweiterungen → Apps Script** öffnen. Dadurch gehört das Script zur Redaktionsdatei und kann deren Menü bereitstellen.
4. Den Inhalt von [Code.gs](../google-apps-script/Code.gs) in die Datei `Code.gs` kopieren.
5. Über **+ → Script** eine Datei `Core` anlegen und den Inhalt von [Core.gs](../google-apps-script/Core.gs) hineinkopieren.
6. In den Projekteinstellungen die Anzeige der Manifestdatei aktivieren. Den Inhalt von [appsscript.json](../google-apps-script/appsscript.json) in `appsscript.json` übernehmen.
7. Die Funktion **`setup`** ausführen und die Google-Berechtigungen prüfen und bestätigen.

`setup()` legt die Tabs und das Formular an, importiert den bereits veröffentlichten Startkatalog und installiert die notwendigen Ereignis-Trigger. Die erzeugten Links stehen im Tab **Status**. Die Einrichtung lässt sich erneut ausführen: vorhandene redaktionelle Zeilen werden nicht ersetzt. Wenn der Startkatalog noch nicht im Repository erreichbar ist, wartet die Einrichtung mit einer erklärenden Fehlermeldung; nach Veröffentlichung erneut ausführen.

Ein eigenständiges Apps-Script-Projekt kann zwar ebenfalls eine Tabelle erzeugen, für das Redaktionsmenü ist die oben beschriebene Installation **aus der Tabelle heraus** vorgesehen.

## 2. Formular wirklich ohne Anmeldung zugänglich machen

Den Link **Formular bearbeiten** aus dem Tab **Status** öffnen. In Google Forms prüfen:

- Unter **Veröffentlichen / Teilen → Antwortende / Allgemeiner Zugriff** muss **Jeder mit dem Link** ausgewählt sein.
- **E-Mail-Adressen erfassen** ist ausgeschaltet. Das optionale Rückfragefeld ist eine gewöhnliche Textfrage und verlangt keine Google-Identität.
- **Auf eine Antwort beschränken** ist ausgeschaltet.
- Es gibt keine Datei-Upload-Frage.
- **Antworten nachträglich bearbeiten** und **Ergebnisübersicht anzeigen** bleiben ausgeschaltet.

Der Code setzt die entsprechenden Formularoptionen, soweit sie per Apps Script verfügbar sind. Die Zugriffsrichtlinie der Google-Organisation kann jedoch zusätzliche Grenzen vorgeben. Die veraltete Methode `setRequireLogin()` wird bewusst nicht verwendet. Die verantwortliche Person muss daher den öffentlichen Antwortzugriff im aktuellen Google-Dialog kontrollieren.

**Entscheidender Test:** Den öffentlichen Formularlink in einem privaten Browserfenster ohne Google-Anmeldung öffnen und eine vollständige Testantwort absenden. Erst wenn dies funktioniert, darf die Verbindung im nächsten Schritt aktiviert werden. Falls eine institutionelle Richtlinie öffentliche Antworten verhindert, muss die zuständige Administration den vorgesehenen Zugriff ermöglichen oder die Redaktion ein dafür geeignetes Google-Konto verwenden. Der Script-Code umgeht solche Richtlinien nicht.

## 3. GitHub einmalig verbinden

Diese Schritte benötigt nur die technische Administration.

1. Im Repository **MUK-Labs/Musiktheorie → Settings → Pages** als Veröffentlichungsquelle **GitHub Actions** wählen, sofern dies noch nicht eingestellt ist.
2. Einen **fine-grained Personal Access Token** für genau dieses Repository erstellen. Er benötigt **Contents: Read and write**; die Metadaten-Leseberechtigung wird von GitHub mitgeführt. Kein Zugriff auf andere Repositories und keine Workflow-Schreibberechtigung ist nötig.
3. Bei einem Organisations-Repository eine gegebenenfalls erforderliche Token-Freigabe durch die Organisation abwarten.
4. In **Apps Script → Projekteinstellungen → Script Properties** eine Eigenschaft `GITHUB_TOKEN` mit diesem Token anlegen. Den Token niemals in Quellcode, Tabellenzellen oder öffentliche URLs schreiben.
5. `GITHUB_REPOSITORY` ist bereits auf `MUK-Labs/Musiktheorie` gesetzt. Die Veröffentlichung erfolgt auf `main`; Branch-Regeln müssen die vorgesehenen autorisierten Daten-Updates zulassen.
6. Die Redaktionsdatei neu laden. Im Menü **Musiktheorie → Anmeldung-freien Zugang bestätigen** den erfolgreich durchgeführten Test bestätigen.

Die erste Veröffentlichung überträgt den geprüften Katalog und trägt den öffentlichen Formularlink in `config.json` ein. Damit wird der Beitragslink in der Website aktiv. Persönliche Einladungslinks werden dort nie hinterlegt.

**Status richtig lesen:** „An GitHub übertragen“ bestätigt das Daten-Update. Die Website folgt erst nach einem erfolgreichen GitHub-Pages-Build. Der Link zum Build-Status steht ebenfalls im Tab **Status**. Scheitert Export oder Übertragung, bleibt die bisherige Website verfügbar; die Fehlermeldung wird in der Redaktionsdatei angezeigt.

## 4. Persönliche Einladung ohne Google-Anmeldung

1. In der Redaktionsdatei **Musiktheorie → Persönliche Einladung erstellen** wählen.
2. Einen Namen oder ein Kürzel zur internen Zuordnung eingeben.
3. Den angezeigten Link kopieren und persönlich weitergeben.

Der Link öffnet dasselbe öffentliche Google-Formular. Das Code-Feld ist bereits ausgefüllt. Die eingeladene Person braucht kein Konto und kann direkt absenden. Das Script prüft den Code gegen die private Einladungsliste. Ein aktiver Code erlaubt die automatische Übernahme einer vollständigen, formal gültigen Ressource.

Jeder Code besteht aus zwei zufälligen UUIDs. Im Tab **Einladungen** wird nur seine SHA-256-Prüfsumme gespeichert. Der originale Einladungslink wird einmal angezeigt; geht er verloren, einen neuen erzeugen und den alten sperren. Zum Sperren die Einladungszeile auswählen und **Musiktheorie → Ausgewählte Einladung sperren** wählen oder `Aktiv` auf `false` setzen. Optional ist ein Ablaufzeitpunkt im ISO-Format möglich, beispielsweise `2027-09-01T00:00:00Z`.

Ein Einladungslink ist eine Berechtigung für seine Besitzerin oder seinen Besitzer. Eine Weiterleitung gibt diese Berechtigung weiter. Er ist keine verifizierte Identitätsprüfung.

**Native Google-Forms-Antworten bleiben privat:** Google Forms speichert die abgeschickten Antworten einschließlich des Code-Felds im eigenen Antwortspeicher. Deshalb Formular-Editorzugang und Antwortdaten ausschließlich der Administration geben und keine Ergebnisübersicht veröffentlichen. Der Script-Eingang in Sheets entfernt den Klartextcode; bewusst wird kein zusätzliches ungefiltertes Antwortblatt verknüpft. Private Antworten und Einladungsdaten gehören niemals in das Repository.

## 5. Funktionsprüfung vor der Einladung weiterer Personen

Mit sinnvollen, tatsächlich existierenden Ressourcen prüfen:

1. **Öffentliche Antwort ohne Code:** landet unter **Eingang → Offen**, erscheint noch nicht im Katalog.
2. **Freigabe durch Redaktion:** Zeile auswählen → **Ausgewählte Vorschläge freigeben**. Die Ressource erscheint nach erfolgreicher Veröffentlichung.
3. **Aktiver persönlicher Link in einem abgemeldeten Browser:** Antwort wird **Übernommen** und automatisch veröffentlicht. Kein zweiter Klick durch die Redaktion.
4. **Gesperrter oder falscher Code:** eine neue Antwort landet wieder unter **Offen**.
5. **Öffentliche Korrektur mit Ressourcen-ID:** bleibt offen; der bisherige Eintrag bleibt unverändert, bis die Korrektur freigegeben ist.
6. **Ungültige Daten:** fehlende Beschreibungen, unbekannte IDs oder unsichere Linkschemata werden als technische Fehler angezeigt und nicht veröffentlicht.
7. **Datenschutzprüfung des öffentlichen JSON:** keine Codes, Code-Prüfsummen, Rückfragekontakte oder internen Hinweise enthalten.

Eine Zeile mit **Fehler** ist keine zusätzliche redaktionelle Prüfung für vertrauenswürdige Beiträge. Sie bezeichnet unvollständige Angaben oder ein technisches Problem. Nach Behebung können die Angaben berichtigt und erneut verarbeitet werden. Der Menüpunkt **Letzte Formulareingänge nachholen** verarbeitet bis zu 100 letzte Antworten erneut, überspringt bereits erledigte Antworten und kann technisch fehlgeschlagene Eingänge wieder aufnehmen.

## Betrieb und Übergabe

- Formularantworten und Änderungen an öffentlichen Redaktionstabs versuchen die Veröffentlichung unmittelbar. Es gibt keinen GitHub-Cronjob und keinen Token im Browser.
- Bei vorübergehendem Netzwerkfehler erneut **Jetzt veröffentlichen** wählen. Die nächste relevante Änderung versucht ebenfalls die Veröffentlichung.
- Bei absichtlich größeren Überarbeitungen den Status zunächst auf **Entwurf** setzen und zusammengehörige Angaben vollständig eintragen. Veröffentlichte Sammlungen dürfen keine unveröffentlichten Ressourcen referenzieren.
- Nach neuen Kategorien, Institutionen oder Betreuungspersonen **Formular-Auswahl aktualisieren** wählen. Dadurch werden die Optionen der bestehenden Fragen aktualisiert; Einladungslinks bleiben gültig.
- Die automatische Verarbeitung läuft unter dem Google-Konto, das die Trigger installiert hat. Ein Eigentümerwechsel der Datei überträgt diese Trigger nicht automatisch. Bei einer Übergabe installiert die neue verantwortliche Person die Trigger mit `setup()` und ersetzt den GitHub-Token; die bisherige Person entfernt ihre alten Trigger. Google-Eigentums- und Organisationsregeln vorher prüfen.
- Alle Personen mit Script-Bearbeitungsrechten sind technische Administratoren und können auf die hinterlegten Verbindungsdaten zugreifen. Persönliche Einladungsempfänger erhalten solche Rechte nicht.
- Tokenablauf und eine verantwortliche Vertretung dokumentieren. Den öffentlichen Katalog zusätzlich als JSON sichern; private Redaktionstabellen getrennt und mit den passenden Zugriffsrechten sichern.

## Technische Referenzen

- [Google Forms: Veröffentlichung und Antwortzugriff](https://support.google.com/docs/answer/2839588?hl=de)
- [Google Forms: Apps Script Form API](https://developers.google.com/apps-script/reference/forms/form)
- [Vorausgefüllte Formularlinks](https://developers.google.com/apps-script/reference/forms/form-response#toPrefilledUrl())
- [Installierbare Trigger und deren Eigentümer](https://developers.google.com/apps-script/guides/triggers/installable)
- [GitHub Contents API](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents)
- [Fine-grained GitHub Tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
