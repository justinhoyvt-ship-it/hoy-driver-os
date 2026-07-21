# Pulse-VT Site Structure

Future structure:

- `index.html` — Pulse-VT rider homepage
- `request.html` — bridge to the existing reservation Apps Script
- `ride-status.html` — private rider status access
- `how-it-works.html`
- `interest.html`

Rules:

- The existing Apps Script request form remains the only Ride Requests writer.
- Do not create a second reservation backend.
- Do not expose private rider or driver information.
- Do not claim live tracking, automatic dispatch, fare calculation, or payment.
- Pulse-VT is separate from Pulse OS.
- What's Up in Vermont is separate from both.
