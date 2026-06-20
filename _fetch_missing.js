// Targeted re-fetch of specific album ids (wrong matches + rate-limited misses)
const fs = require('fs');
const https = require('https');
const path = require('path');

const TARGET = ['y1', 'y21', 'p8', 'p10', 'p12', 'p9', 'p13', 'p14', 'p15'];
const albums = JSON.parse(fs.readFileSync('_albums.json', 'utf8')).filter(a => TARGET.includes(a.id));
const dir = path.join(__dirname, 'covers');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'cover-fetch' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return resolve(get(res.headers.location));
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const baseTitle = s => norm(String(s).replace(/\s*[\(\[].*$/, '').replace(/[:\-–].*$/, ''));

async function search(term, attempt = 0) {
  const api = `https://itunes.apple.com/search?entity=album&limit=25&term=${encodeURIComponent(term)}`;
  const r = await get(api);
  const txt = r.buf.toString('utf8');
  if (/rate limit/i.test(txt) || r.status === 403) {
    if (attempt >= 6) throw new Error('rate-limited');
    const wait = 12000 * (attempt + 1);
    console.log('   rate-limited, waiting', wait / 1000 + 's...');
    await sleep(wait); return search(term, attempt + 1);
  }
  return JSON.parse(txt);
}
function pickBest(results, band, title) {
  const nb = norm(band), nt = baseTitle(title);
  const byArtist = results.filter(x => norm(x.artistName) === nb && x.artworkUrl100);
  return byArtist.find(x => baseTitle(x.collectionName) === nt) ||
         byArtist.find(x => baseTitle(x.collectionName).startsWith(nt) && nt.length > 2) ||
         byArtist.find(x => nt.startsWith(baseTitle(x.collectionName)) && baseTitle(x.collectionName).length > 2) ||
         null;
}

(async () => {
  console.log('cooling down 90s before starting...'); await sleep(90000);
  const still = [];
  for (const a of albums) {
    try {
      const data = await search(a.band + ' ' + a.title);
      const pick = pickBest(data.results || [], a.band, a.title);
      if (!pick) { console.log('MISS', a.id, a.band, '-', a.title); still.push(a.id); await sleep(4000); continue; }
      const img = await get(pick.artworkUrl100.replace('100x100bb', '600x600bb'));
      if (img.status !== 200) { console.log('IMG FAIL', a.id, img.status); still.push(a.id); await sleep(4000); continue; }
      fs.writeFileSync(path.join(dir, a.id + '.jpg'), img.buf);
      console.log('OK  ', a.id, '<=', pick.artistName, '-', pick.collectionName);
    } catch (e) { console.log('ERR ', a.id, e.message); still.push(a.id); }
    await sleep(4000);
  }
  console.log(`\nDone. Still unresolved (${still.length}): ${still.join(', ') || 'none'}`);
})();
