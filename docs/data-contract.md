# Catalogue contract (version 1)

`data/catalogue.json` is the public, approved snapshot. Google Sheets is the editorial source after setup. Raw submissions, invitation codes/hashes, contact addresses and internal notes must never appear in this file or the public site.

```json
{
  "schemaVersion": 1,
  "meta": {"title": "Musiktheorie", "updatedAt": "2026-10-24T00:00:00Z", "source": "starter-catalogue"},
  "vocab": {
    "subjects": [{"id": "harmony", "label": {"de": "Harmonielehre", "en": "Harmony"}, "aliases": ["harmonic analysis"]}],
    "topics": [{"id": "functional-harmony", "label": {"de": "Funktionstheorie", "en": "Functional harmony"}, "parentId": "harmony", "aliases": []}],
    "stages": [], "difficulties": [], "types": [], "languages": [], "access": []
  },
  "institutions": [{"id": "example-institution", "name": {"de": "Example", "en": "Example"}, "shortName": "Example", "url": "https://example.org/", "aliases": []}],
  "maintainers": [{"id": "example-person", "name": "Example Person", "url": "https://example.org/"}],
  "resources": [{
    "id": "r-example", "title": "Example", "url": "https://example.org/",
    "description": {"de": "Beispiel", "en": "Example"},
    "subjects": ["harmony"], "topics": [], "stages": ["bachelor"],
    "difficulty": "introductory", "languages": ["de"], "type": "portal",
    "institutionIds": [], "maintainerIds": [], "authors": [],
    "access": "free", "license": "", "prerequisites": {"de": "", "en": ""},
    "reviewedAt": "2026-10-24", "sourceUrls": ["https://example.org/"],
    "status": "published", "parentId": ""
  }],
  "collections": [{"id": "c-example", "title": {"de": "Beispiel", "en": "Example"}, "description": {"de": "", "en": ""}, "curator": "Redaktion", "items": [{"resourceId": "r-example", "note": {"de": "", "en": ""}}]}]
}
```

Vocabulary entries share `{id,label:{de,en},aliases?:[],parentId?:string}`. IDs are permanent. Values are independently selectable; OR within a facet, AND across facets. Unknown attribution is an empty array, not an invented institution. Descriptions need at least one language. Parent topics are included when filtering a broad subject. Historical external material may change independently of this snapshot.

Canonical vocabulary IDs for first implementation:

- subjects: `fundamentals`, `aural-skills`, `harmony`, `counterpoint`, `form`, `analysis`, `rhythm`, `tuning`, `historical-practice`, `instrumentation`, `composition`, `pedagogy`, `electronic-music`
- stages: `music-school`, `secondary`, `pre-university`, `bachelor`, `master`, `continuing`
- difficulties: `introductory`, `intermediate`, `advanced`, `mixed`, `unspecified`
- types: `portal`, `course`, `exercise`, `interactive`, `article`, `video`, `book`, `reference`
- languages: `de`, `en`, `fr`, `it`, `es`, `und`
- access: `free`, `registration`, `mixed`, `paid`, `unknown`

URL state: `ui`, `q`, repeated `subject`, `topic`, `stage`, `difficulty`, `institution`, `maintainer`, `language`, `type`, `access`; `sort=title|newest`; `collection`; `items` (comma-separated ordered IDs); `resource` (detail); `title` (selection title). Explicit URL state wins over local preferences. `collection` and `items` are mutually exclusive. Search links remain live; item links freeze IDs/order, not descriptions.

Public `config.json`: `{ "defaultUi":"de", "formUrl":"", "githubUrl":"https://github.com/MUK-Labs/Musiktheorie", "siteUrl":"https://muk-labs.github.io/Musiktheorie/" }`. Empty `formUrl` means setup is not complete; the UI must not pretend a submission was sent. Invitation links go directly to the Google Form with a prefilled code, never through public site configuration.

Code must derive approval from a privately validated invitation, not an editable status/role field. Public corrections must be reviewed again and must not overwrite the published snapshot before approval. Automatic checks still apply to trusted entries, with no human-review gate.

The private intake additionally stores `new_institution_name`, `new_institution_url` and a server-reserved `new_institution_id`. These are not public resource fields. At acceptance the name is resolved against current institutional names, short names and aliases; a missing institution is created only after resource and institution validation succeed, and its ID is added to the accepted resource. Public proposals do not alter the institution registry before approval. Trusted contributions use the same acceptance rules without human review. Repeated processing reuses the reserved ID or an institution accepted since the original submission.

URLs in public snapshots are complete HTTP(S) URLs. The Google intake may accept a plausible bare domain and prepend `https://`; surrounding whitespace is trimmed before validation. Descriptions continue to require at least one of `de` or `en`.
