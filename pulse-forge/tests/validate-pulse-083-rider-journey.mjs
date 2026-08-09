import fs from 'node:fs';

const codeUrl = new URL('../../pulse-autobuild/request-app/Code.gs', import.meta.url);
const s = fs.readFileSync(codeUrl, 'utf8');

const required = [
  "'Confirmed':['Ride confirmed'",
  "'Leaving':['Your driver is leaving'",
  "'On the way':['Driver on the way'",
  "'Arriving soon':['Arriving soon'",
  "'Arrived':['Driver has arrived'",
  "'Ride in progress':['Ride in progress'",
  "'Complete':['Ride complete'",
  "'Cancelled':['Ride cancelled'",
  'PULSE VERMONT',
  'MY RIDE',
  'prefers-reduced-motion',
  "This private page shows your ride progress only. Live location is not shared here yet."
];

for (const x of required) {
  if (!s.includes(x)) throw new Error('missing ' + x);
}

console.log('PULSE-083 rider journey validation passed');
