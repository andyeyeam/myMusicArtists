// Embed all covers/<id>.jpg into the HTML as base64 data URIs, so the page is
// fully self-contained and works from file:// (no server, no cross-origin loads).
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'genesis-yes-pink-floyd-overview.html');
const dir = path.join(__dirname, 'covers');
let html = fs.readFileSync(htmlPath, 'utf8');

const files = fs.readdirSync(dir).filter(f => /\.jpg$/i.test(f)).sort();
const entries = files.map(f => {
  const id = f.replace(/\.jpg$/i, '');
  const b64 = fs.readFileSync(path.join(dir, f)).toString('base64');
  return JSON.stringify(id) + ':"data:image/jpeg;base64,' + b64 + '"';
});
const block =
  '<!--COVERS-START-->\n<script>window.__COVERS={' + entries.join(',') + '};</script>\n<!--COVERS-END-->\n';

// remove any previously-injected block, then insert before the main <script>
html = html.replace(/<!--COVERS-START-->[\s\S]*?<!--COVERS-END-->\n?/, '');
const at = html.lastIndexOf('<script>');
html = html.slice(0, at) + block + html.slice(at);

fs.writeFileSync(htmlPath, html);
const mb = (Buffer.byteLength(html, 'utf8') / 1048576).toFixed(1);
console.log(`Embedded ${files.length} covers. HTML is now ${mb} MB.`);
