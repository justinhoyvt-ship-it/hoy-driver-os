# PULSE-085A QrLiveRequest.html patch

Target: `QrLiveRequest.html` in Friend Request app-Main.

The QR form keeps its working NOW/LATER/fare UI. Change only the submit server call:

```diff
-      .submitQrLiveRide(data);
+      .submitQrLiveRideReliable(data);
```

Failure presentation must not expose Apps Script lock internals. If a second contention failure reaches the client, show:

`Your request is still processing. Please try Send request once more.`

Do not change QR routing, fare validation, or same-day behavior in this patch.
