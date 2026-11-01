// Ranking functions shared by the page and the eval, so the eval tests what ships.
// Every ranker returns tweet indices, best first.

// ---------- Keyword: BM25 ----------
// BM25 scores a tweet higher when it contains the query's words (more so for
// rare words, via IDF), with diminishing returns for repeats (k1) and a penalty
// for long tweets that match only by being long (b).

const STOPWORDS = new Set(('a an and are as at be but by for from has have i if in is it its ' +
    'me my of on or so that the this to was we with you your').split(' '));

export function tokenize(text) {
    return text.toLowerCase()
        .replace(/[’']/g, '')                 // don't -> dont, so it matches either spelling
        .split(/[^\p{L}\p{N}]+/u)
        .filter(w => w && !STOPWORDS.has(w));
}

export class BM25 {
    constructor(texts, { k1 = 1.2, b = 0.75 } = {}) {
        this.k1 = k1;
        this.b = b;
        this.docs = texts.map(t => {
            const tf = new Map();
            const tokens = tokenize(t);
            for (const w of tokens) tf.set(w, (tf.get(w) || 0) + 1);
            return { tf, len: tokens.length };
        });
        this.avgLen = this.docs.reduce((s, d) => s + d.len, 0) / this.docs.length;
        const df = new Map();
        for (const d of this.docs) for (const w of d.tf.keys()) df.set(w, (df.get(w) || 0) + 1);
        const N = this.docs.length;
        this.idf = new Map();
        for (const [w, n] of df) this.idf.set(w, Math.log(1 + (N - n + 0.5) / (n + 0.5)));
    }

    scores(query) {
        const terms = [...new Set(tokenize(query))];
        return this.docs.map(d => {
            let s = 0;
            for (const w of terms) {
                const f = d.tf.get(w);
                if (!f) continue;
                const norm = 1 - this.b + this.b * d.len / this.avgLen;
                s += this.idf.get(w) * f * (this.k1 + 1) / (f + this.k1 * norm);
            }
            return s;
        });
    }
}

// ---------- Semantic: cosine similarity ----------
// Vectors are normalized to length 1, so cosine similarity is just the dot product.

export function cosineScores(queryVec, matrix, dim) {
    const n = matrix.length / dim;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        let s = 0;
        const off = i * dim;
        for (let j = 0; j < dim; j++) s += queryVec[j] * matrix[off + j];
        out[i] = s;
    }
    return out;
}

// ---------- Ranking helpers ----------

// Indices sorted by score, best first. minScore drops non-matches (BM25 score 0).
export function rank(scores, { minScore = -Infinity } = {}) {
    return [...scores.keys()]
        .filter(i => scores[i] > minScore)
        .sort((a, b) => scores[b] - scores[a]);
}

// Hybrid: reciprocal rank fusion. Each list adds 1 / (k + position) for each tweet.
// It merges by rank, not score, so BM25 scores (0 to ~20) and cosine (-1 to 1)
// never need to be put on the same scale. k = 60 is the usual default.
export function rrf(rankings, k = 60) {
    const fused = new Map();
    for (const list of rankings) {
        list.forEach((idx, pos) => fused.set(idx, (fused.get(idx) || 0) + 1 / (k + pos + 1)));
    }
    return [...fused.keys()].sort((a, b) => fused.get(b) - fused.get(a));
}
