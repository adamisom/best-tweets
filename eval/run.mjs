// Scores the three rankers against your labels.
// Recall at 10 = of the tweets you marked relevant for a query, the share that
// appear in the method's top 10. Averaged over queries.
// Usage: npm run eval   (reads eval/labels.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRankers } from './rankers.mjs';

const K = 10;
const dir = path.dirname(fileURLToPath(import.meta.url));
const labels = JSON.parse(fs.readFileSync(path.join(dir, 'labels.json'), 'utf8'))
    .filter(l => l.relevant.length > 0);
const { tweets, rankers } = await makeRankers();
const text = new Map(tweets.map(t => [t.url, t.content]));

const names = Object.keys(rankers);
const sums = Object.fromEntries(names.map(n => [n, 0]));
const verbose = process.argv.includes('--misses');

console.log(`${'query'.padEnd(44)} ${names.map(n => n.padStart(9)).join('')}  relevant`);
for (const { query, relevant } of labels) {
    const row = [];
    for (const name of names) {
        const top = new Set((await rankers[name](query)).slice(0, K));
        const found = relevant.filter(u => top.has(u)).length;
        const recall = found / relevant.length;
        sums[name] += recall;
        row.push(recall.toFixed(2).padStart(9));
        if (verbose && found < relevant.length) {
            for (const u of relevant.filter(u => !top.has(u))) {
                console.log(`    ${name} missed: ${text.get(u).slice(0, 90)}`);
            }
        }
    }
    console.log(`${query.slice(0, 43).padEnd(44)} ${row.join('')}  ${relevant.length}`);
}
console.log('-'.repeat(44 + 9 * names.length + 10));
console.log(`${`mean recall@${K} (${labels.length} queries)`.padEnd(44)} ${names.map(n => (sums[n] / labels.length).toFixed(3).padStart(9)).join('')}`);
