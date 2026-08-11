# PULSE-085B production patch

Target: **Hoy Driver OS** Apps Script project.

The existing runtime already injects `ForegroundPickup.html` immediately before `</body>`. PULSE-085B adds one additional client layer after that existing file.

## Code.gs — surgical `doGet()` change only

Preserve all existing server logic. In `doGet()` load the new client file and append it after `ForegroundPickup`:

```diff
 function doGet() {
   const base = HtmlService.createHtmlOutputFromFile('Index').getContent();
   const foreground = HtmlService.createHtmlOutputFromFile('ForegroundPickup').getContent();
-  const html = pulse069InjectForeground_(base, foreground);
+  const pulse085b = HtmlService.createHtmlOutputFromFile('Pulse085BClient').getContent();
+  const html = pulse069InjectForeground_(base, foreground + '\n' + pulse085b);
   return HtmlService.createHtmlOutput(html)
```

Do not replace the whole `Code.gs`.

## Add these files

- `Pulse085B.gs`
- `Pulse085BClient.html`

## Resulting driver behavior

- Starting a confirmed rider pickup no longer launches an external maps window.
- Pulse draws the driving route on its existing Leaflet map using a read-only Apps Script Maps route preview.
- Rider-facing `Leaving -> On the way -> Arriving soon -> Arrived` remains automatic from the existing foreground GPS logic.
- Driver primary controls are reduced to route-to-pickup, Start ride, route-to-destination, and Complete ride.
- Incoming request and Scheduled cards receive the first cleaner ride-app visual pass with fare emphasized.

## Safety

- `pulse085bRoutePreview()` performs no Sheet writes.
- No rider lifecycle writer is duplicated.
- No automatic deployment.
- Existing external `navTo()` behavior is overridden only after PULSE-085B loads; rollback is removal of the two new files plus this one-line injection.
