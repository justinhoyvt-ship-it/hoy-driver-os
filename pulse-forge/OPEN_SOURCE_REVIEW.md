# Open-source and current-tool review

## Adopted patterns

### google/clasp

Useful patterns: complete-project pull/push, local source control, deployment version management, and remote function execution. Forge does not depend on clasp at runtime because the requirement is to build from inside Apps Script. No clasp source is copied.

### Google Workspace CLI

Useful pattern: discovery-driven Workspace API commands and a script push operation that replaces complete Apps Script project content. Forge keeps its API layer small and explicit instead of adding a CLI runtime dependency.

### Google Workspace Apps Script samples

Useful patterns: official manifest, trigger, API, and error-handling conventions. Product-specific samples should be adopted only through the Code Depo license and security gate.

## Possible later additions

- Generate a standard `.clasp.json` and local package for emergency recovery.
- Add a GitHub Actions job that uses clasp only for independent CI verification.
- Add a signed artifact manifest compatible with SLSA provenance.
- Add OSV dependency scanning for projects that introduce npm dependencies.
- Add an OpenSSF Scorecard gate before adopting third-party repositories.

## Obsolescence rule

Direct REST calls are isolated in `ForgeProjectApi.gs`. If Google changes an endpoint or introduces a stronger official client, only that adapter should need replacement; package assembly, hashing, validation, registry, and A/B engine logic remain stable.
