# PULSE-086R4 — live driver repair

Repairs the production failures observed after PULSE-086R3 deployment.

Scope:
- fail-safe driver shell: legacy controls remain usable unless the R4 replacement actually mounts
- explicit Start shift / End shift
- active Pulse ride always exposes the correct next action, including Complete ride
- direct in-console Accept/Decline; no driver confirmation tab
- multiple NOW requests queue without interrupting the active ride
- accepted LATER/future rides remain server-backed in Scheduled until Start pickup is deliberately pressed
- Scheduled cards use one lifecycle action: Start pickup (or Queue next while another ride is active)
- payment preference is surfaced as Pay now / Pay after ride instead of raw Notes markers
- request and confirmation emails include Payment
- Track my ride links are built from the currently deployed Friend Request web app URL

Production files changed:
- `apps-script/hoy-driver-os-writer/Pulse086Client.html`
- `pulse-autobuild/request-app/QrLiveServer.gs`

After deploying Friend Request, run `pulseR4SyncWebAppUrl()` once so the status form POST target and generated Track links point at the current deployment.
