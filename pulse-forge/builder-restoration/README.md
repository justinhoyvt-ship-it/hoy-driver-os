# PULSE-080R: Permanent Forge Builder Restoration

## Purpose

Restores the stable `runNextReadyTask` entry point as a separate permanent
Pulse Forge controller file (`SelfValidatingBuilder.gs`), decoupled from
the core `Code.gs` orchestration layer.

## Files

| File | Role |
|------|------|
| `pulse-forge/controller/SelfValidatingBuilder.gs` | Permanent Builder with `runNextReadyTask` entry point |
| `pulse-forge/controller/PermanentBuilderInstaller.gs` | Fail-closed installer with rollback |
| `pulse-forge/tests/validate-builder-restoration.mjs` | CI validation script |
| `pulse-forge/builder-restoration/manifest.json` | Package manifest |
| `pulse-forge/builder-restoration/README.md` | This file |
| `pulse-forge/builder-restoration/ROLLBACK.md` | Rollback procedure |
| `pulse-agent/tasks/PULSE-080R.json` | Task record |

## Safety

- Does **not** overwrite `Code.gs`
- Does **not** activate an engine
- Does **not** deploy production
- Does **not** modify production data
- Does **not** automatically merge
- Maximum three scoped repair attempts
- Manual merge gate required
- Immutable rollback version captured before any write
- Automatic rollback on failed installation or self-test

## Validation

```bash
npm --prefix pulse-forge run validate
```

All stages must pass before the PR may be merged.
