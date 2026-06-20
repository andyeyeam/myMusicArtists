// Fetch stubborn covers from MusicBrainz + Cover Art Archive (overwrites on success)
const fs = require('fs');
const https = require('https');
const path = require('path');

const JOBS = [
  { id: 'y1',  artist: 'Yes',        rg: 'Yes' },
  { id: 'y21', artist: 'Yes',        rg: 'Heaven & Earth' },
  { id: 'p8',  artist: 'Pink Floyd', rg: 'The Dark Side of the Moon' },
  { id: 'p10', artist: 'Pink Floyd', rg: 'Animals' },
  { id: 'p12', artist: 'Pink Floyd', rg: 'The Final Cut' },
  { id: 'p14', artist: 'Pink Floyd', rg: 'The Division Bell' },
];
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
      const q = `artist:"${j.artist}" AND releasegroup:"${j.rg}"`;
      const api = `https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(q)}&fmt=json&limit=10`;
      const r = await get(api, true);
      const data = JSON.parse(r.buf.toString('utf8'));
      const groups = (data['release-groups'] || []).filter(g =>
        norm((g['artist-credit'] || []).map(a => a.name).join('')) .includes(norm(j.artist)));
      // prefer exact title + Album primary type
      const nt = norm(j.rg);
      const pick = groups.find(g => norm(g.title) === nt && g['primary-type'] === 'Album') ||
                   groups.find(g => norm(g.title) === nt) || groups[0];
      if (!pick) { console.log('NO RG', j.id, j.rg); fail.push(j.id); await sleep(1200); continue; }
      await sleep(1200); // be polite to MB
      const img = await get(`https://coverartarchive.org/release-group/${pick.id}/front-500`);
      if (img.status !== 200 || img.buf.length < 1000) { console.log('NO ART', j.id, '(rg', pick.id + ')', img.status); fail.push(j.id); await sleep(1200); continue; }
      fs.writeFileSync(path.join(dir, j.id + '.jpg'), img.buf);
      console.log('OK  ', j.id, '<=', pick.title, '/', pick.id, '(' + img.buf.length + ' bytes)');
    } catch (e) { console.log('ERR ', j.id, e.message); fail.push(j.id); }
    await sleep(1200);
  }
  console.log(`\nDone. Unresolved (${fail.length}): ${fail.join(', ') || 'none'}`);
})();
