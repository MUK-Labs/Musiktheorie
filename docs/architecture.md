# Architecture and decisions

## Editorial source and public site

The public catalogue is a dependency-free static application hosted on GitHub Pages. It reads `data/catalogue.json` from its own origin; visiting the site does not query a private Google Sheet or expose a Google/GitHub credential. All resource URLs are external destinations, not copies of the linked materials.

Google Sheets becomes the editorial source after its owner runs the one-time setup. Google Forms receives public suggestions and invitations without requiring contributor sign-in. A small owner-authorized Apps Script records submissions privately, validates invitations, processes approval and publishes an allowlisted snapshot to the repository. A push to `main` triggers the test/build/Pages workflow.

The initial researched snapshot makes the website usable while Google setup is pending. The contribution action remains explicitly unavailable until a public responder URL is configured. Do not insert a placeholder form URL or simulate successful submissions.

## Trust and review

- The public link has no invitation; suggestions require an editor's approval.
- A personal invitation link contains a high-entropy bearer code. Only the private script validates that code. Editable status, email or role fields cannot grant trust.
- An active valid invitation bypasses human review; required-field and reference checks still run.
- Each invitation is revocable independently. Forwarding a live invitation forwards its capability.
- Public revisions do not change a currently published record until an editor accepts the revision.
- Contributor identities, raw form responses, invitation hashes/codes and administrative credentials never belong in the public snapshot.
- Script triggers execute with the owner's authorization. Include trigger ownership, credential rotation and recovery in a real handover; sharing a Sheet alone does not transfer the whole integration.

## Catalogue semantics

Subjects, educational contexts and difficulty are independent. University affiliation does not imply university difficulty. Author, maintainer, institution and contributor are separate roles. Missing affiliations remain unassigned. Original titles are retained; English interface language does not imply the linked material is available in English.

Stable IDs support long-lived links. Translated labels are presentation values. Subjects and topics have bilingual labels and search aliases; broad subjects include descendant topics. Searches use OR within a facet and AND between facets.

Shared searches are live queries. Shared selections preserve ordered resource IDs; they do not freeze third-party content or record metadata. Named collections are maintained in the editorial source. A missing ID remains visible as an unavailable selection item rather than silently being substituted. Local saved selections are device-specific; shared links carry the selection IDs explicitly.

## Publication and failure behaviour

The Node validation/build step checks references, required fields, link schemes, publication states and unexpected/private fields before building `dist/`. A failed build is not deployed, leaving the previously deployed site online. The export and Google-side status distinguish accepted data from a successful GitHub push; a successful push is not itself proof that Pages deployment has finished.

GitHub Pages activation requires an administrator once. The connector used for development can edit repository content but does not expose Pages administration, so the workflow reports the exact setup when needed. Its automatic job token must not be used to try to grant itself administrative capabilities.

The application intentionally has no tracking, external fonts, service worker or third-party UI libraries. This reduces publication dependencies and stale-cache surprises. External resources and an enabled Google Form retain their own policies and availability.

## Validation scope

Automated tests cover shared URL round-trips, filter combinations, bilingual search/fallback, collection ordering, stale links and refusal to publish private/unapproved fields. Intake tests cover approval routing and export boundaries. Browser checks cover real catalogue interactions, responsive layout and repository subpath handling.

Live Google execution must be verified by the account owner after authorization, including a signed-out contribution, trusted acceptance, revoked-code moderation, public approval and a successful published update. A locally tested Apps Script scaffold does not establish that a particular institution permits anonymous responder access.

## Primary implementation references

- [Google Forms responder access and prefilled links](https://support.google.com/docs/answer/2839588?hl=en)
- [Apps Script installable triggers](https://developers.google.com/apps-script/guides/triggers/installable)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub contents API](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents)
- [SKOS multilingual vocabulary model](https://www.w3.org/TR/skos-primer/)
- [Schema.org LearningResource](https://schema.org/LearningResource)

The first two support the submission workflow; the latter vocabulary standards inform the model without requiring RDF infrastructure.
