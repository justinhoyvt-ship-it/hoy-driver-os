# PULSE-086 production patch

Target: Hoy Driver OS Apps Script only.

## Add
- `Pulse086Client.html`

## doGet surgical injection
Production already carries the PULSE-085B late-loaded client. Preserve all existing server logic and append PULSE-086 after PULSE-085B:

```diff
 const foreground = HtmlService.createHtmlOutputFromFile('ForegroundPickup').getContent();
 const pulse085b = HtmlService.createHtmlOutputFromFile('Pulse085BClient').getContent();
+const pulse086 = HtmlService.createHtmlOutputFromFile('Pulse086Client').getContent();
-const html = pulse069InjectForeground_(base, foreground + '\n' + pulse085b);
+const html = pulse069InjectForeground_(base, foreground + '\n' + pulse085b + '\n' + pulse086);
```

Do not replace the whole `Code.gs`.

## First test after deployment
1. Open console with no active rider ride: no TEST target or opportunity card on main driving surface.
2. Submit QR NOW request: Inbox card shows route + fare + Accept/Decline with stronger hierarchy.
3. Accept once: button immediately enters a temporary busy state; repeated tap should not fire during the guard window.
4. Start confirmed rider pickup: route remains in the Pulse map.
5. Progress to Start ride / Complete ride: one clear rider-flow action at a time.
6. Verify Uber mirror remains available when no Pulse rider workflow is active.

Rollback is removal of the one PULSE-086 injection line and `Pulse086Client.html`.
