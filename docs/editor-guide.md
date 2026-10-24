# Redaktionsleitfaden

Der Alltag findet im Google-Formular und in der Redaktionsdatei statt. GitHub ist für die einmalige technische Verbindung erforderlich, nicht für die laufende Pflege.

## Ressourcen hinzufügen

**Öffentliche Beiträge:** Das Formular über den Katalog öffnen. Der Vorschlag landet im privaten Tab **Eingang** mit der Entscheidung **Offen**. Eine verantwortliche Person prüft Beschreibung, Link, Zuordnung und etwaige Dubletten.

**Vertrauenswürdige Kolleginnen und Kollegen:** Den persönlichen Einladungslink öffnen, ausfüllen und absenden. Ein Google-Konto ist nicht nötig. Vollständige, gültige Beiträge werden automatisch übernommen und zur Veröffentlichung übertragen. Nach dem Website-Build sind sie sichtbar. Die Einladung erlaubt direkte Veröffentlichung, bestätigt aber nicht automatisch Autorenschaft oder institutionelle Zugehörigkeit des beschriebenen Materials.

Die Einladung enthält einen persönlichen Code. Bitte nicht öffentlich teilen. Bei Verlust oder versehentlicher Weitergabe kann die Administration den Code sperren und einen neuen Link erstellen.

## Einen öffentlichen Vorschlag freigeben

1. Im Tab **Eingang** die betreffende Zeile auswählen.
2. Öffentliche Angaben bei Bedarf direkt in dieser Zeile korrigieren. Das Feld **Notiz (privat)** und **Rückfragekontakt (privat)** bleiben intern.
3. **Musiktheorie → Ausgewählte Vorschläge freigeben** wählen. Alternativ die Entscheidung auf **Freigegeben** setzen.
4. Nach erfolgreicher Übernahme steht dort **Übernommen**. Ab jetzt wird der Eintrag im Tab **Ressourcen** gepflegt.

**Abgelehnt** beendet einen Vorschlag ohne Veröffentlichung. **Fehler** bezeichnet fehlende Angaben oder ein technisches Problem; die Spalte **Hinweis** nennt den Grund. Ein gültiger Einladungscode erspart die redaktionelle Freigabe, nicht die Prüfung, ob beispielsweise eine URL oder Beschreibung fehlt.

## Vorhandene Ressourcen pflegen

Im Tab **Ressourcen** stehen die veröffentlichten Datensätze. Die **ID** bleibt unverändert, auch wenn Titel oder Link geändert werden. Mehrfachwerte, zum Beispiel mehrere Fächer, werden mit Semikolon getrennt. Die erlaubten IDs und ihre lesbaren Namen stehen in den Referenztabs.

| Status | Wirkung |
|---|---|
| **Entwurf** | Wird nicht exportiert. |
| **Freigegeben** | Wird beim nächsten erfolgreichen Export veröffentlicht. |
| **Archiviert** | Wird nicht mehr öffentlich gelistet; die interne Zeile bleibt erhalten. |

Änderungen an freigegebenen Daten versuchen die Aktualisierung automatisch. Bei umfangreichen Eingaben zunächst einen Entwurf verwenden oder vollständige Zellen gemeinsam einfügen. Der letzte gültige Katalog bleibt online, wenn eine unvollständige Änderung einen Fehler auslöst.

Eine öffentliche Korrektur wird als neuer Vorschlag mit der vorhandenen **Ressourcen-ID** eingereicht. Das Formular verlangt dabei den vollständigen gewünschten Datensatz. Der bisherige Eintrag wird erst nach Freigabe ersetzt. Nachträgliche Bearbeitung einer alten Formularantwort bleibt deshalb ausgeschaltet. Vertrauenswürdige Korrekturen mit aktivem Einladungscode werden nach den formalen Prüfungen automatisch übernommen.

## Kategorien und Attribution

- **Fach**, **Bildungsbereich** und **Schwierigkeit** beschreiben unterschiedliche Eigenschaften. Eine von einer Universität veröffentlichte Einführung kann für die Musikschule geeignet sein.
- **Sprache** bezeichnet die Sprache der verlinkten Ressource. Eine englische Katalogbeschreibung macht ein deutsches Lernangebot nicht englischsprachig.
- **Autorinnen und Autoren**, **Betreuung** und **Institutionen** nur zuordnen, wenn die Beziehung zur Ressource belegt ist. Unbekannte Angaben bleiben leer.
- **Lizenz** beschreibt bekannte Wiederverwendungsrechte; kostenfreier Zugang allein ist keine offene Lizenz.
- Ein allgemeines Portal und eine konkret nützliche Unterrichtseinheit können getrennte Einträge erhalten. Die optionale **Übergeordnete ID** verknüpft sie.
- Neue Kategorien erhalten eine dauerhafte ID und beide Sprachlabels. Nach Änderungen an Kategorien, Institutionen oder Betreuungspersonen **Musiktheorie → Formular-Auswahl aktualisieren** verwenden.

## Eine benannte Sammlung erstellen

1. Im Tab **Sammlungen** eine Zeile mit einer neuen dauerhaften ID, etwa `c-kontrapunkt-einstieg`, anlegen.
2. Titel und optional Einleitung in Deutsch und Englisch ausfüllen, die kuratierende Person nennen und zunächst **Entwurf** wählen.
3. Im Tab **Sammlungseinträge** pro Ressource eine Zeile ergänzen: Sammlungs-ID, Ressourcen-ID, Reihenfolge und optional ein kurzer Unterrichtshinweis in beiden Sprachen.
4. Reihenfolgen wie `10`, `20`, `30` lassen Platz für spätere Ergänzungen.
5. Die Sammlung auf **Freigegeben** setzen.

Die Sammlung ist über `?collection=c-kontrapunkt-einstieg` teilbar. Beim späteren Umordnen bleibt dieser Link gültig. Alle referenzierten Ressourcen müssen veröffentlicht sein. Vor dem Archivieren einer Ressource ihre Einträge aus veröffentlichten Sammlungen entfernen oder die Sammlung entsprechend überarbeiten.

Besucherinnen und Besucher können unabhängig davon im Katalog eine persönliche Auswahl zusammenstellen und deren Link teilen. Dafür wird kein Konto und keine redaktionelle Freigabe benötigt; es handelt sich um eine Auswahl bereits veröffentlichter Ressourcen.

## Veröffentlichung kontrollieren

Der Tab **Status** zeigt den letzten erfolgreichen Datentransfer und etwaige Fehler. „An GitHub übertragen“ bedeutet, dass der öffentliche Datensatz aktualisiert wurde; die Website folgt nach erfolgreichem Build. Im Zweifel **Musiktheorie → Jetzt veröffentlichen** erneut ausführen. Im normalen Betrieb ist kein GitHub-Schritt durch die Redaktion erforderlich.

Wenn Formularantworten wegen eines technischen Fehlers noch fehlen, nach dessen Behebung **Letzte Formulareingänge nachholen** auswählen. Bereits erledigte Eingänge werden anhand ihrer unveränderlichen Antwort-ID übersprungen.

Die private Redaktionsdatei, der Formular-Antwortspeicher und persönliche Einladungen werden nicht öffentlich geteilt. Zur einmaligen Einrichtung und bei einem Wechsel der technisch verantwortlichen Person siehe [Google-Einrichtung](google-setup.md).
