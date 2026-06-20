// One-off build script: download album covers from the iTunes Search API
// into ./covers/<id>.jpg, and write covers/manifest.json
const fs = require('fs');
const https = require('https');
const path = require('path');

const albums = JSON.parse(fs.readFileSync('_albums.json', 'utf8'));
const dir = path.join(__dirname, 'covers');
fs.mkdirSync(dir, { recursive: true });

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'cover-fetch' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(get(res.headers.location));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// strip trailing parenthetical/edition junk from a release title before comparing
const baseTitle = s => norm(String(s).replace(/\s*[\(\[].*$/, '').replace(/[:\-–].*$/, ''));

// fetch the search JSON, retrying when iTunes returns a rate-limit body
async function search(term, attempt = 0) {
  const api = `https://itunes.apple.com/search?entity=album&limit=20&term=${encodeURIComponent(term)}`;
  const r = await get(api);
  const txt = r.buf.toString('utf8');
  if (/rate limit/i.test(txt) || r.status === 403) {
    if (attempt >= 4) throw new Error('rate-limited');
    const wait = 6000 * (attempt + 1);
    console.log('   rate-limited, waiting', wait / 1000 + 's...');
    await sleep(wait);
    return search(term, attempt + 1);
  }
  return JSON.parse(txt);
}

function pickBest(results, band, title) {
  const nb = norm(band), nt = baseTitle(title);
  const byArtist = results.filter(x => norm(x.artistName) === nb && x.artworkUrl100);
  // exact title, then title-prefix, among correct-artist releases
  return byArtist.find(x => baseTitle(x.collectionName) === nt) ||
         byArtist.find(x => baseTitle(x.collectionName).startsWith(nt) && nt.length > 2) ||
         byArtist.find(x => nt.startsWith(baseTitle(x.collectionName)) && baseTitle(x.collectionName).length > 2) ||
         null; // no confident match -> keep the generated SVG fallback
}

(async () => {
  const manifest = {};
  let ok = 0; const misses = [];
  for (const a of albums) {
    try {
      const data = await search(a.band + ' ' + a.title);
      const pick = pickBest(data.results || [], a.band, a.title);
      if (!pick) {
        console.log('MISS', a.id, a.band, '-', a.title);
        try { fs.unlinkSync(path.join(dir, a.id + '.jpg')); } catch (_) {}
        misses.push(a.id); await sleep(700); continue;
      }
      const img = await get(pick.artworkUrl100.replace('100x100bb', '600x600bb'));
      if (img.status !== 200) { console.log('IMG FAIL', a.id, img.status); misses.push(a.id); await sleep(700); continue; }
      fs.writeFileSync(path.join(dir, a.id + '.jpg'), img.buf);
      manifest[a.id] = { band: a.band, title: a.title, matched: pick.collectionName, artist: pick.artistName };
      console.log('OK  ', a.id, '<=', pick.artistName, '-', pick.collectionName);
      ok++;
    } catch (e) {
      console.log('ERR ', a.id, e.message); misses.push(a.id);
    }
    await sleep(700); // pace API calls
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nDone. ${ok} downloaded. Missing (${misses.length}): ${misses.join(', ')}`);
})();
