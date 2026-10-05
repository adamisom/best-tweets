// Embeds every tweet offline and writes the vectors the page ships with.
// Usage: npm run embed   (rerun after adding tweets)
//
// Output:
//   vectors.bin        Float32, little-endian, one row of DIM numbers per tweet
//   vectors-meta.json  model settings and the tweet url for each row, in order
//
// The page embeds queries with the same MODEL, DTYPE, pooling and normalization
// (search-config.js). If they differ, query and tweet vectors aren't comparable.
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from '@huggingface/transformers';
import { loadTweets, repoRoot } from './lib/tweets.mjs';
import { MODEL, DTYPE, DIM, embedText } from './search-config.js';

const tweets = loadTweets();
const embed = await pipeline('feature-extraction', MODEL, { dtype: DTYPE });

const vectors = new Float32Array(tweets.length * DIM);
const BATCH = 32;
for (let i = 0; i < tweets.length; i += BATCH) {
    const batch = tweets.slice(i, i + BATCH).map(t => embedText(t.content));
    const out = await embed(batch, { pooling: 'mean', normalize: true });
    vectors.set(out.data, i * DIM);
    process.stdout.write(`\r${Math.min(i + BATCH, tweets.length)}/${tweets.length}`);
}

fs.writeFileSync(path.join(repoRoot, 'vectors.bin'), Buffer.from(vectors.buffer));
fs.writeFileSync(path.join(repoRoot, 'vectors-meta.json'), JSON.stringify({
    model: MODEL, dtype: DTYPE, dim: DIM, count: tweets.length,
    urls: tweets.map(t => t.url),
}) + '\n');
console.log(`\nvectors.bin: ${tweets.length} x ${DIM} (${(vectors.byteLength / 1024).toFixed(0)} KB)`);
