// Inject _durations.json into the HTML as window.__DURATIONS (before the main script)
const fs = require('fs');
const htmlPath = 'genesis-yes-pink-floyd-overview.html';
let html = fs.readFileSync(htmlPath, 'utf8');
const data = fs.readFileSync('_durations.json', 'utf8');

const block = '<!--DURATIONS-START-->\n<script>window.__DURATIONS=' + data + ';</script>\n<!--DURATIONS-END-->\n';
html = html.replace(/<!--DURATIONS-START-->[\s\S]*?<!--DURATIONS-END-->\n?/, '');
const at = html.lastIndexOf('<script>');
html = html.slice(0, at) + block + html.slice(at);
fs.writeFileSync(htmlPath, html);

const n = Object.keys(JSON.parse(data)).length;
console.log('Injected __DURATIONS for', n, 'albums (' + (data.length / 1024).toFixed(1) + ' KB).');
