// The three rankers, in Node, built from the same search.js and vectors the page uses.
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from '@huggingface/transformers';
import { loadTweets, repoRoot } from './tweets.mjs';
import { MODEL, DTYPE, DIM, embedText } from '../search-config.js';
import { BM25, cosineScores, rank, rrf } from '../search.js';

export async function makeRankers() {
    const tweets = loadTweets();
    const meta = JSON.parse(fs.readFileSync(path.join(repoRoot, 'vectors-meta.json'), 'utf8'));
    if (meta.urls.join() !== tweets.map(t => t.url).join()) {
        throw new Error('vectors are stale: run npm run embed');
    }
    const matrix = new Float32Array(fs.readFileSync(path.join(repoRoot, 'vectors.bin')).buffer.slice(0));
    const bm25 = new BM25(tweets.map(t => embedText(t.content)));
    const embed = await pipeline('feature-extraction', MODEL, { dtype: DTYPE });
    const urls = idxs => idxs.map(i => tweets[i].url);

    const keyword = q => urls(rank(bm25.scores(q), { minScore: 0 }));
    const semantic = async q => {
        const out = await embed(q, { pooling: 'mean', normalize: true });
        return urls(rank(cosineScores(out.data, matrix, DIM)));
    };
    const hybrid = async q => rrf([keyword(q), await semantic(q)]);

    return { tweets, rankers: { keyword, semantic, hybrid } };
}

export function readQueries(file) {
    return fs.readFileSync(file, 'utf8').split('\n')
        .map(l => l.trim()).filter(l => l && !l.startsWith('#'));
}
