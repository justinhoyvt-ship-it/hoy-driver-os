import fs from 'node:fs';
const s=fs.readFileSync('pulse-autobuild/request-app/Code.gs','utf8');
for(const x of ["'Confirmed':['Ride confirmed'","'On the way':['Driver on the way'","'Arrived':['Driver has arrived'","'Complete':['Ride complete'",'PULSE VERMONT','MY RIDE','prefers-reduced-motion']) if(!s.includes(x)) throw new Error('missing '+x);
console.log('PULSE-083 rider journey validation passed');
