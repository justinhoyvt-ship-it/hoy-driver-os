# PULSE-085A QrLiveRequest.html patch

Keep the working NOW/LATER/fare UI and change only the request submit call:

```diff
-      .submitQrLiveRide(data);
+      .submitQrLiveRideReliable(data);
```

If a second lock-contention failure reaches the client, do not expose Apps Script internals. Rider copy: `Your request is still processing. Please try Send request once more.`
