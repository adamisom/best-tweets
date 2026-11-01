// Builds judge batches from saved runs: each answer split into sentences with their citations,
// next to the full text of the tweets the model was given.
// Usage: node eval/rag-judge-prep.mjs <outdir> <run.json>...   (run files from eval/rag-runs/)
// Writes <outdir>/<run>.txt, one per run, and <outdir>/<run>.index.json mapping items to sentences.
import fs from 'node:fs';
import path from 'node:path';
import { loadTweets } from '../lib/tweets.mjs';
import { parseAnswer } from '../rag-config.js';

const [outdir, ...files] = process.argv.slice(2);
const text = new Map(loadTweets().map(t => [t.url, t.content]));
fs.mkdirSync(outdir, { recursive: true });

for (const file of files) {
    const run = JSON.parse(fs.readFileSync(file, 'utf8'));
    const name = path.basename(file, '.json');
    let out = '';
    const index = [];
    for (const r of run.results) {
        const { sentences } = parseAnswer(r.answer, run.k);
        index.push({ id: r.id, sentences });
        out += `## ITEM ${r.id}\nQUESTION: ${r.question}\nTWEETS:\n`;
        r.tweets.forEach((u, i) => out += `[${i + 1}] ${(text.get(u) || '').replace(/\n/g, ' ')}\n`);
        out += `ANSWER (full): ${r.answer.replace(/\n+/g, ' ')}\nSENTENCES:\n`;
        sentences.forEach((s, i) => out += `  s${i}: ${s.text.replace(/\n/g, ' ')}  | cites: ${s.cites.join(', ') || 'none'}\n`);
        out += '\n';
    }
    fs.writeFileSync(path.join(outdir, `${name}.txt`), out);
    fs.writeFileSync(path.join(outdir, `${name}.index.json`), JSON.stringify(index));
    console.log(`${name}: ${index.length} answers, ${index.reduce((s, x) => s + x.sentences.length, 0)} sentences`);
}
