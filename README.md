# Pulse OS Runtime Autobuild

This replaces the blocked Apps Script self-updater.

The repository is the source of truth. GitHub Actions validates and packages a one-file Apps Script runtime on every change to `main`. The workflow never contacts Google and does not need Google credentials.

The generated runtime intentionally excludes:

- Apps Script REST API calls
- self-modifying source
- Drive access
- project/deployment scopes
- Autopilot and Forge maintenance code

The Apps Script project receives only `Code.gs` and `appsscript.json`. Final deployment remains manual because Google refused the source-management authorization.

Run locally:

```bash
npm run autobuild
```

Successful output is stored in `dist/`.
