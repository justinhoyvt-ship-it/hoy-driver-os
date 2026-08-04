# PULSE-078 live-source reconciliation

- Capture: `20260804-183219`
- Report hash: `e6f0ec4ca4013217370f49562aa9794197cd591eaf989592c6f48756157a2da6`
- MATCH: 0
- DIFF: 10
- LIVE_ONLY: 7
- REPO_ONLY: 12
- Proposed canonical changes: 9
- Authorized Ride Requests writer: `PULSE_REQUEST_APP`
- Apps Script HEAD writes: 0
- Deployments: 0
- Production data changes: none

Controller drift remains repository-preferred. Live application drift is proposed
through this reviewed PR. Every complete live source file is also preserved under
the capture folder before any canonical source change is reviewed.
