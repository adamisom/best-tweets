// Scores judged RAG runs. For each run in eval/rag-runs/ that has verdicts in
// eval/rag-verdicts/ (same file name), prints one row of the results table.
// Usage: node eval/rag-score.mjs [--split dev|test] [run names...]
//
// On the 30 on-topic questions:
//   valid      share of citations that point to a tweet the model was given
//   supported  share of claim sentences the judge marked supported
//   +partly    share marked supported or partly
//   responsive share of answers that respond to the question
// On the 6 off-topic questions:
//   declined   how many the model declined, or the score cutoff skipped
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAnswer } from '../rag-config.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const s = args.indexOf('--split');
const split = s > -1 ? args.splice(s, 2)[1] : null;
const questions = JSON.parse(fs.readFileSync(path.join(dir, 'questions.json'), 'utf8'));

// Dev and test halves, for tuning the prompt on one half and reporting on the other:
// alternate on-topic questions, and the off-topic ones 3 and 3.
const half = new Map();
questions.filter(q => !q.offTopic).forEach((q, i) => half.set(q.id, i % 2 ? 'test' : 'dev'));
questions.filter(q => q.offTopic).forEach((q, i) => half.set(q.id, i < 3 ? 'dev' : 'test'));

const names = args.length ? args : fs.readdirSync(path.join(dir, 'rag-verdicts')).map(f => f.replace(/\.json$/, ''));
const pct = (a, b) => b ? `${Math.round(100 * a / b)}%` : '-';

console.log(['run', 'valid', 'supported', '+partly', 'responsive', 'declined', 'sec/answer'].join(' | '));
for (const name of names.sort()) {
    const run = JSON.parse(fs.readFileSync(path.join(dir, 'rag-runs', `${name}.json`), 'utf8'));
    const verdicts = JSON.parse(fs.readFileSync(path.join(dir, 'rag-verdicts', `${name}.json`), 'utf8'));
    const t = { cites: 0, valid: 0, claims: 0, supported: 0, partly: 0, onTopic: 0, responsive: 0, offTopic: 0, declined: 0, skipped: 0, skippedOnTopic: 0, ms: 0, n: 0 };
    for (const r of run.results) {
        if (split && half.get(r.id) !== split) continue;
        t.ms += r.ms; t.n++;
        // Answers the score cutoff skipped (rag-config.js, SKIP_BELOW) never reached the model or the judge.
        if (r.skipped) {
            if (r.offTopic) { t.offTopic++; t.declined++; t.skipped++; }
            else { t.onTopic++; t.skippedOnTopic++; }
            continue;
        }
        const v = verdicts[r.id];
        if (!v) throw new Error(`${name}: no verdict for ${r.id}`);
        if (r.offTopic) {
            t.offTopic++;
            if (v.declined === 'yes') t.declined++;
            continue;
        }
        const { sentences } = parseAnswer(r.answer, run.k);
        if (v.verdicts.length !== sentences.length) throw new Error(`${name}/${r.id}: ${v.verdicts.length} verdicts for ${sentences.length} sentences`);
        t.onTopic++;
        if (v.responsive === 'yes') t.responsive++;
        sentences.forEach((sen, i) => {
            t.cites += sen.cites.length;
            t.valid += sen.cites.length - sen.invalid.length;
            if (v.verdicts[i] === 'no-claim') return;
            t.claims++;
            if (v.verdicts[i] === 'supported') t.supported++;
            if (v.verdicts[i] === 'partly') t.partly++;
        });
    }
    console.log([name, pct(t.valid, t.cites), pct(t.supported, t.claims), pct(t.supported + t.partly, t.claims),
        pct(t.responsive, t.onTopic), `${t.declined}/${t.offTopic}${t.skipped ? ` (${t.skipped} by cutoff)` : ''}`,
        (t.ms / t.n / 1000).toFixed(1)].join(' | ') + (t.skippedOnTopic ? `  [cutoff wrongly skipped ${t.skippedOnTopic} on-topic]` : ''));
}
