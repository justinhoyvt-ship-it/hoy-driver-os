# PULSE-080R — Permanent Builder restoration

This package restores `runNextReadyTask` in the live Pulse Forge controller. It does not replace `Code.gs` and does not remove any temporary PULSE files.

## What is installed

- `SelfValidatingBuilder.gs` — the permanent Forge-native Builder and stable entry point.
- `PermanentBuilderInstaller.gs` — a one-time, fail-closed installer and explicit rollback function.
- `manifest.json` — immutable source hash, controller identity, CI requirements, and safety contract.

The old `pulse-agent/builder/SelfValidatingBuilder.gs` remains historical source. It is not installed because it depends on the retired Builder Bridge globals (`PB`, `sheet_`, `runNextReadyTaskCore_`, and related helpers) that are not present in the Forge controller.

## Fail-closed installation path

1. Merge the single reviewed restoration PR only after `Pulse Forge CI / validate-forge` passes.
2. Add `PermanentBuilderInstaller.gs` to the live controller as one temporary installer file; do not alter `Code.gs` or any existing PULSE file.
3. Run `forgeInstallPermanentBuilder` once.
4. The installer requires the restoration PR to be merged, verifies the required GitHub check, fetches the Builder from the merged commit, and verifies its locked SHA-256.
5. It reads the complete live controller package, creates an immutable rollback version, preserves every existing server and HTML file byte-for-byte, adds only `executionApi.access = MYSELF` to the manifest when needed, and adds `SelfValidatingBuilder` as a separate server file.
6. It verifies the post-write inventory and creates an isolated API Executable deployment from an immutable post-install version and invokes `forgePermanentBuilderSelfTest` against that version.
7. Any failed gate rolls back automatically to the exact pre-install package and leaves PULSE-080 blocked.
8. A passing runtime receipt marks the Builder `VERIFIED`; only the isolated controller self-test deployment is created; no production deployment is created and no engine is activated.

## Restored Builder contract

`runNextReadyTask` is the only stable task entry point. The Builder uses one stable branch per task and refuses to create a second PR. It validates required CI, waits for manual merge, then writes only registered non-production projects and creates isolated test deployments. It waits for a phone-test decision and never deploys production automatically.

PULSE-080 remains untouched until the installation runtime self-test passes.
