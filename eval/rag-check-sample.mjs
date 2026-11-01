// Picks a fixed sample of answer units from the shipping run for Adam to judge by hand,
// so the LLM judge's verdicts can be checked against his. Writes eval/rag-check.json.
// Usage: node eval/rag-check-sample.mjs [run name] [count]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTweets } from '../lib/tweets.mjs';
import { parseAnswer } from '../rag-config.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const name = process.argv[2] || 'Qwen3-0.6B-ONNX-q4f16-k5-v1';
const count = parseInt(process.argv[3] || '25', 10);
const run = JSON.parse(fs.readFileSync(path.join(dir, 'rag-runs', `${name}.json`), 'utf8'));
const text = new Map(loadTweets().map(t => [t.url, t.content]));

const units = [];
for (const r of run.results) {
    if (r.skipped || r.offTopic) continue;
    parseAnswer(r.answer, run.k).sentences.forEach((s, i) => units.push({
        id: r.id, unit: i, question: r.question, text: s.text,
        cited: s.cites.filter(n => n >= 1 && n <= run.k).map(n => ({ n, tweet: text.get(r.tweets[n - 1]) })),
    }));
}
// A fixed shuffle (seeded), so the sample is the same every time.
let seed = 42;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
for (let i = units.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [units[i], units[j]] = [units[j], units[i]]; }
fs.writeFileSync(path.join(dir, 'rag-check.json'), JSON.stringify({ run: name, units: units.slice(0, count) }, null, 1) + '\n');
console.log(`eval/rag-check.json: ${Math.min(count, units.length)} of ${units.length} units from ${name}`);
