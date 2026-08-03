# Reusable Forge project templates

`forgeReusableProjectTemplate(templateId, options)` generates complete Apps Script packages for:

- `ENGINE`: an execution-API enabled replaceable engine with `forgeEngineSelfTest`.
- `WEB_APP`: a JSON health endpoint plus a namespaced health function.
- `LIBRARY`: a namespaced no-write library health function.

Every generated template includes one server file, one `appsscript` manifest, required-function validation, package inventory, and deterministic hashes.
