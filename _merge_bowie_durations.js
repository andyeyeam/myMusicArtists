// Merge Bowie per-track durations (from _bowie_data.json) into _durations.json
const fs = require('fs');
const bowie = JSON.parse(fs.readFileSync('_bowie_data.json', 'utf8'));
const durations = JSON.parse(fs.readFileSync('_durations.json', 'utf8'));
let n = 0;
for (const id of Object.keys(bowie)) {
  durations[id] = bowie[id].tracks.map(t => t.dur || '');
  n++;
}
fs.writeFileSync('_durations.json', JSON.stringify(durations));
console.log('Merged durations for', n, 'Bowie albums into _durations.json');
