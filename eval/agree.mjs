// How well does the LLM judge agree with Adam? Compares labels-adam.json with
// labels.json on every pooled tweet of the calibration queries.
// Cohen's kappa corrects raw agreement for the agreement two labelers would reach by chance;
// above about 0.6 is usually read as substantial.
// Usage: node eval/agree.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTweets } from '../lib/tweets.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const pool = new Map(read('pool.json').map(p => [p.query, p.candidates]));
const llm = new Map(read('labels.json').map(l => [l.query, new Set(l.relevant)]));
const adam = read('labels-adam.json').filter(l => pool.has(l.query));
const text = new Map(loadTweets().map(t => [t.url, t.content]));

let both = 0, onlyAdam = 0, onlyLlm = 0, neither = 0;
const disagreements = [];
for (const { query, relevant } of adam) {
    const a = new Set(relevant);
    const l = llm.get(query) ?? new Set();
    for (const u of pool.get(query)) {
        if (a.has(u) && l.has(u)) both++;
        else if (a.has(u)) { onlyAdam++; disagreements.push(`  ${query} | Adam yes, LLM no: ${text.get(u).slice(0, 80)}`); }
        else if (l.has(u)) { onlyLlm++; disagreements.push(`  ${query} | LLM yes, Adam no: ${text.get(u).slice(0, 80)}`); }
        else neither++;
    }
    const outside = relevant.filter(u => !pool.get(query).includes(u)).length;
    if (outside) console.log(`${query}: you added ${outside} tweet(s) neither method put in its top 15`);
}

const n = both + onlyAdam + onlyLlm + neither;
const observed = (both + neither) / n;
const pAdam = (both + onlyAdam) / n, pLlm = (both + onlyLlm) / n;
const chance = pAdam * pLlm + (1 - pAdam) * (1 - pLlm);
const kappa = (observed - chance) / (1 - chance);

console.log(`\n${adam.length} queries, ${n} pooled tweets judged by both`);
console.log(`both yes ${both} · only Adam ${onlyAdam} · only LLM ${onlyLlm} · both no ${neither}`);
console.log(`raw agreement ${(observed * 100).toFixed(1)}% · Cohen's kappa ${kappa.toFixed(2)}`);
if (process.argv.includes('--show')) console.log('\n' + disagreements.join('\n'));
