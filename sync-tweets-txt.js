// Regenerates tweets.txt from index.html (index.html is the source of truth).
// Usage: node sync-tweets-txt.js
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const arr = html.match(/tweetsData = \[[\s\S]*?\n\];/)[0];
const tweets = eval(arr.replace('tweetsData =', '').replace(/;$/, ''));

const txtPath = path.join(dir, 'tweets.txt');
const old = fs.readFileSync(txtPath, 'utf8');
const preamble = old.slice(0, old.indexOf('Category counts'));
const rule = '-'.repeat(70);

const order = ['#relationships', '#growth', '#wisdom', '#beauty', '#misc'];
const counts = {};
tweets.forEach(t => { counts[t.category] = (counts[t.category] || 0) + 1; });

let out = preamble + `Category counts (${tweets.length} tweets total):\n`;
order.forEach(k => { out += '  ' + k.padEnd(15) + ' ' + (counts[k] || 0) + '\n'; });
out += '\n' + rule + '\n\n';
out += tweets.map(t => `${t.content} ${t.category} (@${t.author})`).join('\n') + '\n';

fs.writeFileSync(txtPath, out);
console.log(`tweets.txt: ${tweets.length} tweets`, counts);
