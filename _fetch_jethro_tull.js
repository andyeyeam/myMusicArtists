// Fetch Jethro Tull album covers from MusicBrainz + Cover Art Archive
const fs = require('fs');
const https = require('https');
const path = require('path');

const JOBS = [
  { id: 't1',  rg: 'This Was' },
  { id: 't2',  rg: 'Stand Up' },
  { id: 't3',  rg: 'Benefit' },
  { id: 't4',  rg: 'Aqualung' },
  { id: 't5',  rg: 'Thick as a Brick' },
  { id: 't6',  rg: 'A Passion Play' },
  { id: 't7',  rg: 'WarChild' },                                     // MusicBrainz title has no space
  { id: 't8',  rg: 'Minstrel in the Gallery' },
  { id: 't9',  rg: "Too Old to Rock 'n' Roll: Too Young to Die!" },
  { id: 't10', rg: 'Songs from the Wood' },
  { id: 't11', rg: 'Heavy Horses' },
  { id: 't12', rg: 'Stormwatch' },
  { id: 't13', rg: 'A' },
  { id: 't14', rg: 'The Broadsword and the Beast' },
  { id: 't15', rg: 'Under Wraps' },
  { id: 't16', rg: 'Crest of a Knave' },
  { id: 't17', rg: 'Rock Island' },
  { id: 't18', rg: 'Catfish Rising' },
  { id: 't19', rg: 'Roots to Branches' },
  { id: 't20', rg: 'J-Tull Dot Com' },
  { id: 't21', rg: 'The Jethro Tull Christmas Album' },
  { id: 't22', rg: 'The Zealot Gene' },
  { id: 't23', rg: 'RökFlöte' },
  { id: 't24', rg: 'Curious Ruminant' },
];
const ARTIST = 'Jethro Tull';
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
