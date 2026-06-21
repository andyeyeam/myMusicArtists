// Pull per-track durations from MusicBrainz for every album, aligned to the
// tracklists already in the HTML. Writes _durations.json: { "<id>": ["m:ss", ...] }
const fs = require('fs');
const https = require('https');

const html = fs.readFileSync('genesis-yes-pink-floyd-overview.html', 'utf8');
const BAND = { d: 'Genesis', y: 'Yes', p: 'Pink Floyd', b: 'The Beatles' };
const UA = 'myMusicArtists/1.0 (track durations for personal project; andyeyeam@gmail.com)';

function decode(s) {
  return s.replace(/&amp;/g, '&').replace(/&#39;|&apos;|&rsquo;/g, "'")
          .replace(/&quot;/g, '"').replace(/&#x2026;|&hellip;|…/g, '...')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}
// parse album-blocks -> {id, band, tracks:[names]}
function parseAlbums() {
  const out = [];
  const blocks = html.split('<div class="album-block">').slice(1);
  for (const b of blocks) {
    const idm = b.match(/<div class="detail" id="([a-z]\d+)"/);
    if (!idm) continue;
    const id = idm[1];
    const olm = b.match(/<ol class="tracklist[^"]*">([\s\S]*?)<\/ol>/);
    const tracks = [];
    if (olm) {
      const lis = olm[1].match(/<li>[\s\S]*?<\/li>/g) || [];
      for (const li of lis) {
        const nm = li.replace(/<li>[\s\S]*?<\/span>/, '').replace(/<\/li>/, '').replace(/<[^>]+>/g, '');
        tracks.push(decode(nm));
      }
    }
    out.push({ id, band: BAND[id[0]], title: '', tracks });
  }
  return out;
}

function get(url, json) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA, 'Accept': json ? 'application/json' : '*/*' } }, res => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const fmt = ms => { const t = Math.round(ms / 1000); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };

// pull album title from the HTML row for the search
function titleFor(id) {
  const re = new RegExp('id="' + id + '"');
  const idx = html.search(re);
  const seg = html.slice(Math.max(0, idx - 1200), idx);
  const m = seg.match(/<div class="t">([\s\S]*?)<\/div>/g);
  if (!m) return '';
  return decode(m[m.length - 1].replace(/<[^>]+>/g, ''));
}

async function rgId(band, title) {
  const q = `artist:"${band}" AND releasegroup:"${title}"`;
  const r = await get(`https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(q)}&fmt=json&limit=10`, true);
  const groups = (JSON.parse(r.buf.toString())['release-groups'] || [])
    .filter(g => norm((g['artist-credit'] || []).map(a => a.name).join('')) === norm(band));
  const nt = norm(title);
  const pick = groups.find(g => norm(g.title) === nt && g['primary-type'] === 'Album') ||
               groups.find(g => norm(g.title) === nt) || groups[0];
  return pick && pick.id;
}

async function durationsFor(rgid, tracks) {
  const r = await get(`https://musicbrainz.org/ws/2/release?release-group=${rgid}&inc=recordings&fmt=json&limit=100`, true);
  const releases = (JSON.parse(r.buf.toString()).releases || []);
  const flatten = rel => (rel.media || []).flatMap(m => (m.tracks || []));
  // prefer official release whose flat track count matches the HTML count, fewest null lengths
  let best = null, bestScore = -1;
  for (const rel of releases) {
    const fl = flatten(rel);
    const nonNull = fl.filter(t => t.length).length;
    let score = nonNull;
    if (fl.length === tracks.length) score += 1000;       // exact count match dominates
    if (rel.status === 'Official') score += 50;
    if (score > bestScore) { bestScore = score; best = fl; }
  }
  if (!best) return null;
  // map MB tracks by normalized title
  const byName = {};
  best.forEach((t, i) => { byName[norm(t.title)] = t; });
  return tracks.map((name, i) => {
    let t = byName[norm(name)];
    if (!t && best[i]) t = best[i];        // positional fallback
    return t && t.length ? fmt(t.length) : '';
  });
}

(async () => {
  const albums = parseAlbums();
  console.log('albums parsed:', albums.length);
  const result = {}; const miss = [];
  for (const a of albums) {
    a.title = titleFor(a.id);
    try {
      const id = await rgId(a.band, a.title);
      await sleep(1100);
      if (!id) { console.log('NO RG ', a.id, a.title); miss.push(a.id); continue; }
      const durs = await durationsFor(id, a.tracks);
      const got = durs ? durs.filter(Boolean).length : 0;
      result[a.id] = durs || [];
      console.log('OK   ', a.id, a.title, '->', got + '/' + a.tracks.length, 'durations');
      if (got < a.tracks.length * 0.6) miss.push(a.id);
    } catch (e) { console.log('ERR  ', a.id, e.message); miss.push(a.id); }
    await sleep(1100);
  }
  fs.writeFileSync('_durations.json', JSON.stringify(result));
  console.log('\nWrote _durations.json. Weak/blank albums:', miss.join(', ') || 'none');
})();
