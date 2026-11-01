// How well does the LLM judge agree with Adam on answer citations?
// Compares eval/rag-adam.json (from rag-check.html) with the judge's verdicts for the same units.
// Usage: node eval/rag-agree.mjs [--show]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const adam = JSON.parse(fs.readFileSync(path.join(dir, 'rag-adam.json'), 'utf8'));
const judge = JSON.parse(fs.readFileSync(path.join(dir, 'rag-verdicts', `${adam.run}.json`), 'utf8'));
const sample = JSON.parse(fs.readFileSync(path.join(dir, 'rag-check.json'), 'utf8'));
const textOf = new Map(sample.units.map(u => [`${u.id}#${u.unit}`, u.text]));

// Exact agreement on four verdicts, and agreement on the coarser question "is it supported at all?"
// (supported or partly vs. unsupported), with Cohen's kappa for the coarse one.
let n = 0, exact = 0, both = 0, onlyA = 0, onlyJ = 0, neither = 0;
const diffs = [];
for (const v of adam.verdicts) {
    if (!v.verdict) continue;
    const j = judge[v.id].verdicts[v.unit];
    n++;
    if (j === v.verdict) exact++; else diffs.push(`  ${v.id} | Adam ${v.verdict}, judge ${j}: ${textOf.get(`${v.id}#${v.unit}`).slice(0, 90)}`);
    const a = v.verdict === 'supported' || v.verdict === 'partly';
    const b = j === 'supported' || j === 'partly';
    if (a && b) both++; else if (a) onlyA++; else if (b) onlyJ++; else neither++;
}
const obs = (both + neither) / n;
const pa = (both + onlyA) / n, pj = (both + onlyJ) / n;
const chance = pa * pj + (1 - pa) * (1 - pj);
console.log(`${n} units judged by both`);
console.log(`exact agreement (4 verdicts): ${(100 * exact / n).toFixed(0)}%`);
console.log(`supported-at-all agreement: ${(100 * obs).toFixed(0)}%, Cohen's kappa ${((obs - chance) / (1 - chance)).toFixed(2)}`);
if (process.argv.includes('--show')) console.log('\n' + diffs.join('\n'));
