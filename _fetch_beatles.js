// Fetch Beatles album covers from MusicBrainz + Cover Art Archive
const fs = require('fs');
const https = require('https');
const path = require('path');

const JOBS = [
  { id: 'b1',  rg: 'Please Please Me' },
  { id: 'b2',  rg: 'With the Beatles' },
  { id: 'b3',  rg: "A Hard Day's Night" },
  { id: 'b4',  rg: 'Beatles for Sale' },
  { id: 'b5',  rg: 'Help!' },
  { id: 'b6',  rg: 'Rubber Soul' },
  { id: 'b7',  rg: 'Revolver' },
  { id: 'b8',  rg: "Sgt. Pepper's Lonely Hearts Club Band" },
  { id: 'b9',  rg: 'Magical Mystery Tour' },
  { id: 'b10', rg: 'The Beatles' },          // White Album
  { id: 'b11', rg: 'Yellow Submarine' },
  { id: 'b12', rg: 'Abbey Road' },
  { id: 'b13', rg: 'Let It Be' },
];
const ARTIST = 'The Beatles';
const dir = path.join(__dirname, 'covers');
const UA = 'myMusicArtists/1.0 (cover art for personal project; andyeyeam@gmail.com)';

function get(url, json) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA, 'Accept': json ? 'application/json' : '*/*' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return resolve(get(res.headers.location, json));
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

(async () => {
  const fail = [];
  for (const j of JOBS) {
    try {
      const q = `artist:"${ARTIST}" AND releasegroup:"${j.rg}"`;
      const api = `https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(q)}&fmt=json&limit=15`;
      const r = await get(api, true);
      const groups = (JSON.parse(r.buf.toString('utf8'))['release-groups'] || [])
        .filter(g => norm((g['artist-credit'] || []).map(a => a.name).join('')) === norm(ARTIST));
      const nt = norm(j.rg);
      const pick = groups.find(g => norm(g.title) === nt && g['primary-type'] === 'Album') ||
                   groups.find(g => norm(g.title) === nt) || groups[0];
      if (!pick) { console.log('NO RG', j.id, j.rg); fail.push(j.id); await sleep(1200); continue; }
      await sleep(1200);
      const img = await get(`https://coverartarchive.org/release-group/${pick.id}/front-500`);
      if (img.status !== 200 || img.buf.length < 1000) { console.log('NO ART', j.id, img.status); fail.push(j.id); await sleep(1200); continue; }
      fs.writeFileSync(path.join(dir, j.id + '.jpg'), img.buf);
      console.log('OK  ', j.id, '<=', pick.title, '(' + img.buf.length + ' bytes)');
    } catch (e) { console.log('ERR ', j.id, e.message); fail.push(j.id); }
    await sleep(1200);
  }
  console.log(`\nDone. Unresolved (${fail.length}): ${fail.join(', ') || 'none'}`);
})();
