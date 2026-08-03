# Pulse Forge

Pulse Forge is the permanent Google Apps Script build controller for Pulse Vermont and a reusable foundation for Hip Joint OS and future projects.

## Architecture

- **Stable Controller:** owns authorization, project registry, mutation guards, versioning, test deployments, validation receipts, and rollback metadata.
- **Engine A / Engine B:** replaceable build engines. The active engine always builds the inactive slot; the active pointer changes only after an explicit passing test receipt.
- **Target projects:** request app, Hoy Driver, rider status, Hip Joint OS tools, or future Apps Script products.
- **Production gate:** Forge can prepare and test release versions, but it does not automatically merge GitHub pull requests or update production deployments.

## What this foundation can do

- Create complete Apps Script projects.
- Read all `.gs`, `.html`, and manifest content.
- Validate a complete package before mutation.
- Replace a registered non-production project's complete HEAD content atomically.
- Create immutable versions.
- Create test deployments for registered non-production targets.
- Run allowlisted test functions through the Apps Script Execution API.
- Compare complete file inventories by SHA-256.
- Build and validate the inactive engine slot.
- Create one atomic GitHub tree, commit, branch, and pull request without merging.

`projects.updateContent` replaces every file in a project. Forge therefore performs a full read, expected-HEAD hash check, complete-package validation, and one atomic update. Files omitted from a package are intentionally removed.

## Bootstrap

The first installation is a two-file manual bootstrap in a new standalone Apps Script project because the existing Builder does not have `script.projects` and `script.deployments` authorization. The bootstrap creates its own source-control PR and then creates Engine A and Engine B. After that, project creation and complete non-production project builds occur through Forge.

## Safety contract

- No automatic GitHub merge.
- No automatic production deployment.
- No production HEAD writes.
- Registered target and script ID must match.
- Existing HEAD hash can be required before mutation.
- Test function names are allowlisted.
- Secret-like source patterns fail validation.
- Maximum repair attempts: 3.
