# PULSE-066 Rollback

This rollback applies to the corrected v0.6.1.2 control-state installation.

1. Replace the installed Builder source with the previously saved v0.6.0.1 source.
2. Run `installMobileControlTrigger` only if the existing on-edit trigger is missing or stale.
3. Restore the prior Mobile Control label and keep the run checkbox `FALSE` while blocked.
4. Preserve all Build, Task, Log, artifact, branch, pull-request, and rollback records.
5. Revert the repository validator with the same reviewed merge commit if PULSE-066 is rolled back after merge.
6. Do not deploy or merge as part of rollback.
