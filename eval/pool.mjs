// Builds the candidate pool for labeling: for each query, the union of BM25's and
// semantic search's top POOL_DEPTH, shuffled so you can't tell which method found what.
// Tweets outside the pool count as not relevant unless you add them by hand.
// Usage: node eval/pool.mjs   (reads eval/queries.txt, writes eval/pool.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRankers, readQueries } from './rankers.mjs';

const POOL_DEPTH = 15;
const dir = path.dirname(fileURLToPath(import.meta.url));
const queries = readQueries(path.join(dir, 'queries.txt'));
const { rankers } = await makeRankers();

const shuffle = a => {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

const pool = [];
for (const query of queries) {
    const kw = rankers.keyword(query).slice(0, POOL_DEPTH);
    const sem = (await rankers.semantic(query)).slice(0, POOL_DEPTH);
    pool.push({ query, candidates: shuffle([...new Set([...kw, ...sem])]) });
}
fs.writeFileSync(path.join(dir, 'pool.json'), JSON.stringify(pool, null, 1) + '\n');
const total = pool.reduce((s, p) => s + p.candidates.length, 0);
console.log(`pool.json: ${pool.length} queries, ${total} tweets to judge (avg ${(total / pool.length).toFixed(1)})`);
