// Ask a question of the tweets from the command line, with the same small model the page uses.
// Usage: npm run ask -- "how do I get better at small talk?"   (optional: --model <id>)
// No API key: the model runs on this machine. See DESIGN.md.
import { makeRankers } from './lib/rankers.mjs';
import { makeGenerator } from './lib/generator.mjs';
import { GEN_MODEL, K, SKIP_BELOW, NO_ANSWER, parseAnswer } from './rag-config.js';

const args = process.argv.slice(2);
const m = args.indexOf('--model');
const model = m > -1 ? args.splice(m, 2)[1] : GEN_MODEL;
const question = args.join(' ').trim();
if (!question) {
    console.error('Usage: npm run ask -- "your question"');
    process.exit(1);
}

const { tweets, rankers } = await makeRankers();
const byUrl = new Map(tweets.map(t => [t.url, t]));
const ranked = await rankers.semantic(question);
if (ranked.topScore < SKIP_BELOW) {
    console.log(`\n${question}\n\n${NO_ANSWER} (no tweet is close enough: best score ${ranked.topScore.toFixed(2)})`);
    process.exit(0);
}
const context = ranked.slice(0, K).map(u => byUrl.get(u));
const generate = await makeGenerator(model);
const { answer, sentences } = parseAnswer(await generate(question, context));

console.log(`\n${question}\n\n${answer}\n`);
const invalid = sentences.flatMap(s => s.invalid);
if (invalid.length) console.log(`(cites tweets that weren't given: ${[...new Set(invalid)].join(', ')})\n`);
console.log('Tweets given to the model:');
context.forEach((t, i) => console.log(`[${i + 1}] @${t.author} ${t.url}`));
