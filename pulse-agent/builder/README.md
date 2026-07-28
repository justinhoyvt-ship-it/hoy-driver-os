# Pulse Builder — Self-Validating Loop

PULSE-066 installs the final control-plane upgrade for the current build sequence.

## Locked sequence

`PULSE-059 → PULSE-060 → PULSE-061 → PULSE-066`

PULSE-066 remains last and cannot interrupt an active task.

## Exact command

The existing command remains:

```text
runNextReadyTask
```

One command processes one task only.

## Loop

`Build → Validate → Repair (maximum three scoped attempts) → Retest → Stage → Advance queue`

The Builder validates the staged artifact before GitHub staging. A repair attempt is permitted only when a registered deterministic repair handler can address the exact failing gate. Unknown failures stop immediately with a recovery note. The Builder never asks an AI model to invent a repair.

Repository CI remains part of the pass gate. The existing `.github/workflows/pulse-runtime-autobuild.yml` workflow now runs `pulse-autobuild/scripts/validate.mjs`, which validates both the runtime and the PULSE-066 Builder control package. After CI passes, the task is marked `AUTO_VALIDATED_STAGED`; only one dependency-satisfied successor may become `READY_TO_RUN`.

PULSE-066 is a final-task barrier and does not automatically start or ready another lane.

Only Task ID `PULSE-066` is classified as the self-validating Builder installation task; later tasks in the Builder Infrastructure area use their own staged artifacts.

## Mobile control

The action label is **RUN CURRENT BUILD**.

- `TRUE` is restored only when one staged task is currently `READY`, `READY_PUBLIC`, or `READY_TO_RUN`.
- The value is set to `FALSE` before work begins and remains `FALSE` while running, idle, or blocked.
- The convention is never inverted.
- No separate MARK CHECKED step is required.

## Validation gates

The control plane checks acceptance criteria, exact patch integrity, source syntax, duplicate handlers, protected identifiers, feature flags defaulting off, deterministic fixtures, dependency/license/secret exclusions, repository CI, artifact URL, and rollback proof.

## Repository CI

The Builder package includes `pulse-autobuild/scripts/validate.mjs`. Because that file is inside `pulse-autobuild/**`, the existing `Pulse Runtime Autobuild` pull-request workflow runs on this PR without adding a new deployment workflow. The validator checks Apps Script syntax, duplicate handlers, the locked RUN CURRENT BUILD values, exact PULSE-066 classification, contract JSON, task snapshot proof, rollback markers, and forbidden automation or secret markers.

## Safety boundary

The Builder may create a branch, commits, rollback proof, and a pull request. It does not merge, deploy Apps Script, activate a feature flag, rotate a secret, activate payments, make legal or privacy decisions, or mutate production rider data.

## Installation

Install the complete `Pulse_Builder_Bridge_v0_6_1_1_SELF_VALIDATING_CONTROL_FIXED.gs` source in the existing Builder Apps Script project. The repository module in this folder documents the orchestration layer and is not a replacement for the complete installed source.

## Rollback

Restore Builder v0.6.0.1, restore the previous Mobile Control label/mapping, and preserve all Build, Task, Log, artifact, branch, and pull-request records.
