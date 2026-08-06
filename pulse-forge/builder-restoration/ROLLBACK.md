# PULSE-080R: Rollback Procedure

## When to roll back

Roll back if:
- `permanentBuilderInstall` returns `ok: false`
- The remote `selfValidatingBuilderCheck` self-test does not return `ok: true`
- Any validation stage in `npm --prefix pulse-forge run validate` fails after install

## Automatic rollback

`PermanentBuilderInstaller.gs` captures an immutable rollback version
(`Rollback before PULSE-080R permanent builder install`) via
`forgeCreateScriptVersion` **before** any write is performed.

If the post-install self-test fails, the installer automatically restores
the pre-install file set and creates a new version
(`PULSE-080R rollback after failed self-test`).

## Manual rollback

1. Identify the rollback version number from the `rollbackVersion` field
   in the install result envelope.
2. In the Apps Script dashboard, navigate to the Forge Controller project.
3. Select **Manage versions** and deploy the rollback version number.
4. Confirm `forgeControllerSelfTest()` passes in the live project.

## Constraints

- Do not merge the PR while rollback is in progress.
- Do not activate an engine slot until the Builder passes self-test.
- Do not modify production data during rollback.
- Maximum three scoped repair attempts before escalating manually.
