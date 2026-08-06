# Permanent Builder rollback

The installer creates an immutable Apps Script version before it changes controller HEAD.

## Automatic rollback

If source verification, inventory preservation, duplicate-function checks, Apps Script update verification, execution-deployment discovery, or the runtime Builder self-test fails, the installer restores the exact pre-install file package, including the original manifest and verifies the original package hash.

## Explicit rollback

Run `forgeRollbackPermanentBuilderInstallation()` only when rollback is explicitly approved. It reads the immutable pre-install version, replaces controller HEAD with that exact package, verifies the package hash, and records `ROLLED_BACK` in Script Properties.

Rollback does not merge GitHub, deploy production, activate an engine, modify production data, or remove temporary PULSE files. A failed installation also deletes the isolated self-test deployment when it was created.
