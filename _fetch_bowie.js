// Fetch David Bowie tracklists + durations + cover art from MusicBrainz /
// Cover Art Archive. Writes covers/w*.jpg and _bowie_data.json:
// { "<id>": { title, year, tracks: [{name, dur}] } }
const fs = require('fs');
const https = require('https');
const path = require('path');

const JOBS = [
  { id: 'w1',  artist: 'David Bowie', rg: 'David Bowie',    year: 1967, exp: 14 },
  { id: 'w2',  artist: 'David Bowie', rg: 'David Bowie',    year: 1969, exp: 9 },
  { id: 'w3',  artist: 'David Bowie', rg: 'The Man Who Sold the World', year: 1970, exp: 9 },
  { id: 'w4',  artist: 'David Bowie', rg: 'Hunky Dory',     year: 1971, exp: 11 },
  { id: 'w5',  artist: 'David Bowie', rg: 'The Rise and Fall of Ziggy Stardust and the Spiders from Mars', year: 1972, exp: 11 },
  { id: 'w6',  artist: 'David Bowie', rg: 'Aladdin Sane',   year: 1973, exp: 10 },
  { id: 'w7',  artist: 'David Bowie', rg: 'Pin Ups',        year: 1973, exp: 12 },
  { id: 'w8',  artist: 'David Bowie', rg: 'Diamond Dogs',   year: 1974, exp: 11 },
  { id: 'w9',  artist: 'David Bowie', rg: 'Young Americans', year: 1975, exp: 8 },
  { id: 'w10', artist: 'David Bowie', rg: 'Station to Station', year: 1976, exp: 6 },
  { id: 'w11', artist: 'David Bowie', rg: 'Low',            year: 1977, exp: 11 },
  { id: 'w12', artist: 'David Bowie', rg: '"Heroes"',       year: 1977, exp: 10 },
  { id: 'w13', artist: 'David Bowie', rg: 'Lodger',         year: 1979, exp: 10 },
  { id: 'w14', artist: 'David Bowie', rg: 'Scary Monsters (and Super Creeps)', year: 1980, exp: 10 },
  { id: 'w15', artist: 'David Bowie', rg: "Let's Dance",    year: 1983, exp: 8 },
  { id: 'w16', artist: 'David Bowie', rg: 'Tonight',        year: 1984, exp: 9 },
  { id: 'w17', artist: 'David Bowie', rg: 'Never Let Me Down', year: 1987, exp: 10 },
  { id: 'w18', artist: 'Tin Machine', rg: 'Tin Machine',    year: 1989, exp: 11 },
  { id: 'w19', artist: 'Tin Machine', rg: 'Tin Machine II', year: 1991, exp: 11 },
  { id: 'w20', artist: 'David Bowie', rg: 'Black Tie White Noise', year: 1993, exp: 12 },
  { id: 'w21', artist: 'David Bowie', rg: 'The Buddha of Suburbia', year: 1993, exp: 10 },
  { id: 'w22', artist: 'David Bowie', rg: '1. Outside',     year: 1995, exp: 19 },
  { id: 'w23', artist: 'David Bowie', rg: 'Earthling',      year: 1997, exp: 9 },
  { id: 'w24', artist: 'David Bowie', rg: "'hours...'",     year: 1999, exp: 10 },
  { id: 'w25', artist: 'David Bowie', rg: 'Heathen',        year: 2002, exp: 11 },
  { id: 'w26', artist: 'David Bowie', rg: 'Reality',        year: 2003, exp: 11 },
  { id: 'w27', artist: 'David Bowie', rg: 'The Next Day',   year: 2013, exp: 14 },
  { id: 'w28', artist: 'David Bowie', rg: '★',              year: 2016, exp: 7 },
];

const dir = path.join(__dirname, 'covers');
const UA = 'myMusicArtists/1.0 (album data for personal project; andyeyeam@gmail.com)';

function get(url, json) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA, 'Accept': json ? 'application/json' : '*/*' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return resolve(get(res.headers.location, json));
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
  });
}
async function getRetry(url, json, tries) {
  tries = tries || 6;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await get(url, json);
      if (r.status === 503 || r.status === 429) {
        if (i === tries - 1) return r;
        await sleep(4000 * (i + 1));
        continue;
      }
      return r;
    } catch (e) { if (i === tries - 1) throw e; await sleep(3000 * (i + 1)); }
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const fmt = ms => { const t = Math.round(ms / 1000); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };

async function findRG(artist, title, year) {
  const q = `artist:"${artist}" AND releasegroup:"${title}"`;
  const api = `https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(q)}&fmt=json&limit=25`;
  const r = await getRetry(api, true);
  let groups = (JSON.parse(r.buf.toString('utf8'))['release-groups'] || [])
    .filter(g => norm((g['artist-credit'] || []).map(a => a.name).join('')) === norm(artist));
  if (!groups.length) {
    // fallback: search release-group by title only, filter artist-credit loosely
    await sleep(1800);
    const api2 = `https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent('releasegroup:"' + title + '"')}&fmt=json&limit=25`;
    const r2 = await getRetry(api2, true);
    groups = (JSON.parse(r2.buf.toString('utf8'))['release-groups'] || [])
      .filter(g => norm((g['artist-credit'] || []).map(a => a.name).join('')).includes(norm(artist)));
  }
  const nt = norm(title);
  const exact = groups.filter(g => norm(g.title) === nt);
  const pool = exact.length ? exact : groups;
  let best = null, bestScore = -Infinity;
  for (const g of pool) {
    let score = 0;
    if (g['primary-type'] === 'Album') score += 100;
    const sec = g['secondary-types'] || [];
    if (!sec.length) score += 60;
    if (sec.includes('Compilation')) score -= 200;
    if (sec.includes('Live')) score -= 150;
    if (sec.includes('Spokenword')) score -= 300;
    const gy = g['first-release-date'] ? parseInt(g['first-release-date'].slice(0, 4), 10) : null;
    if (gy && year) score -= Math.abs(gy - year) * 5;
    else if (!gy) score -= 20;
    if (score > bestScore) { bestScore = score; best = g; }
  }
  return best || pool[0];
}

async function tracksFor(rgid, exp) {
  const r = await getRetry(`https://musicbrainz.org/ws/2/release?release-group=${rgid}&inc=recordings&fmt=json&limit=100`, true);
  const releases = (JSON.parse(r.buf.toString()).releases || []);
  const flatten = rel => (rel.media || []).flatMap(m => (m.tracks || []));
  let best = null, bestScore = -Infinity, bestRel = null;
  for (const rel of releases) {
    const fl = flatten(rel);
    if (!fl.length) continue;
    const nonNull = fl.filter(t => t.length).length;
    let score = -1000 * Math.abs(fl.length - exp) + nonNull;
    if (rel.status === 'Official') score += 50;
    if (rel.country === 'GB' || rel.country === 'US') score += 20;
    if (score > bestScore) { bestScore = score; best = fl; bestRel = rel; }
  }
  if (!best) return null;
  return { title: bestRel.title, tracks: best.map(t => ({ name: t.title, dur: t.length ? fmt(t.length) : '' })) };
}

(async () => {
  const out = fs.existsSync(path.join(__dirname, '_bowie_data.json'))
    ? JSON.parse(fs.readFileSync(path.join(__dirname, '_bowie_data.json'), 'utf8')) : {};
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  const jobs = only ? JOBS.filter(j => only.includes(j.id)) : JOBS;
  const fail = [];
  for (const j of jobs) {
    try {
      const rg = await findRG(j.artist, j.rg, j.year);
      await sleep(1800);
      if (!rg) { console.log('NO RG', j.id, j.rg); fail.push(j.id); continue; }
      const data = await tracksFor(rg.id, j.exp);
      await sleep(1800);
      if (!data) { console.log('NO TRACKS', j.id, j.rg); fail.push(j.id); continue; }
      out[j.id] = { title: j.rg, year: j.year, tracks: data.tracks };
      console.log('OK  ', j.id, j.rg, '->', data.tracks.length, 'tracks (exp', j.exp + ')');

      if (!fs.existsSync(path.join(dir, j.id + '.jpg'))) {
        const img = await get(`https://coverartarchive.org/release-group/${rg.id}/front-500`);
        if (img.status === 200 && img.buf.length > 1000) {
          fs.writeFileSync(path.join(dir, j.id + '.jpg'), img.buf);
          console.log('  cover OK', j.id, img.buf.length, 'bytes');
        } else {
          console.log('  cover MISS', j.id, img.status);
        }
        await sleep(1800);
      }
    } catch (e) { console.log('ERR ', j.id, e.message); fail.push(j.id); }
  }
  fs.writeFileSync(path.join(__dirname, '_bowie_data.json'), JSON.stringify(out, null, 2));
  console.log(`\nDone. Unresolved (${fail.length}): ${fail.join(', ') || 'none'}`);
})();
