# Reusable Forge functions

These functions are deliberately product-neutral and can be reused by Hip Joint OS or future Google Apps Script projects.

## Source integrity

- `forgeSha256_` — deterministic SHA-256 for source, records, and artifacts.
- `forgeStableJson_` — recursively sorts object keys for repeatable hashes.
- `forgeCanonicalFiles_` — normalizes and deduplicates complete Apps Script file collections.
- `forgeFileInventory_` — produces file name, type, byte count, and SHA-256.
- `forgePackageHash_` — produces one identity for a complete project package.
- `forgeCompareInventories_` — reports MATCH, DIFF, LEFT_ONLY, or RIGHT_ONLY.

## API and project management

- `forgeApiFetch_` — authenticated JSON adapter for Google APIs.
- `forgeCreateScriptProject` — creates standalone or bound Apps Script projects.
- `forgeGetScriptContent` — retrieves complete HEAD or immutable-version source.
- `forgeUpdateScriptContent` — atomically replaces a registered non-production project after validation and drift checks.
- `forgeCreateScriptVersion` — creates an immutable release snapshot.
- `forgeCreateTestDeployment` — creates a registered non-production deployment.
- `forgeRunScriptFunction` — runs allowlisted test functions remotely.
- `forgeGitHubCreatePullRequest` — creates blobs, a tree, a commit, a branch, and a pull request atomically without merging.

## Governance

- `forgeRegisterProject` — stores project identity, environment, and allowed mutations.
- `forgeValidatePackage` — checks manifests, duplicate functions, secrets, scopes, required functions, and automatic-production markers.
- `forgeBuildInactiveEngine` — always targets the inactive A/B slot.
- `forgeSetActiveEngineSlot` — switches slots only with an explicit passing validation receipt.

The reusable core contains no Pulse fare, driver, rider, music, venue, or education-specific business logic.
