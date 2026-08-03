# PULSE-077 — Forge Engine and task-package generator

PULSE-077 adds the reusable engine layer that sits behind the permanent Forge controller.

## Included

- Deterministic task-package assembly with inventory, package hash, and deterministic hash.
- Read-only Google Drive text-artifact adapter.
- Google Sheets range-artifact adapter.
- Artifact-to-Apps-Script-file conversion.
- Reusable ENGINE, WEB_APP, and LIBRARY project templates.
- Repair execution capped at three attempts and failed closed.
- Immutable validation receipts stored in Script Properties.
- Deterministic CI fixtures and a no-network mocked Apps Script self-test.

## Safety rules

- No GitHub merge operation exists.
- No production HEAD write or deployment is performed.
- No engine pointer changes automatically.
- Drive access is read-only.
- Receipt storage accepts passing validation results only.

## Installation sequence

1. Merge the reviewed PULSE-077 pull request after CI passes.
2. Run `forgeStagePulse077EngineFromMain()` from the temporary controller installer.
3. Inspect the inactive engine build receipt and test deployment.
4. Validate before any explicit engine activation.
