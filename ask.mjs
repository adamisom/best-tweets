// Ask a question of the tweets: retrieve, then generate an answer that cites them (RAG).
// Usage: npm run ask -- "how do I get better at small talk?"
// Needs ANTHROPIC_API_KEY in .env (gitignored). Runs locally; the site stays static.
//
// 1. Retrieve: semantic search (the eval's winner) picks the TOP_K closest tweets.
// 2. Generate: Claude answers using only those tweets, as claims that each cite tweet numbers.
// 3. Check: a second call judges whether each cited tweet supports its claim.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { makeRankers } from './lib/rankers.mjs';

const TOP_K = 10;
const MODEL = 'claude-opus-5-5';

const question = process.argv.slice(2).join(' ').trim();
if (!question) {
    console.error('Usage: npm run ask -- "your question"');
    process.exit(1);
}

const { tweets, rankers } = await makeRankers();
const byUrl = new Map(tweets.map(t => [t.url, t]));
const sources = (await rankers.semantic(question)).slice(0, TOP_K).map(u => byUrl.get(u));
const numbered = sources.map((t, i) => `[${i + 1}] ${t.content} (@${t.author})`).join('\n');

const client = new Anthropic();

// Shared request settings. fallbacks: "default" re-runs a request on another model
// server-side if Claude Opus 5.5's safety classifiers decline it.
async function ask(system, user, schema) {
    const response = await client.beta.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: betaZodOutputFormat(schema) },
        system,
        messages: [{ role: 'user', content: user }],
    }).catch(err => {
        if (/authentication method/.test(err.message)) {
            console.error('No Anthropic credentials. Add ANTHROPIC_API_KEY=... to .env in this folder.');
            process.exit(1);
        }
        throw err;
    });
    if (response.stop_reason === 'refusal') throw new Error('the model declined this request');
    if (!response.parsed_output) throw new Error(`no parsable output (stop_reason: ${response.stop_reason})`);
    return response.parsed_output;
}

const Answer = z.object({
    claims: z.array(z.object({
        text: z.string(),
        tweets: z.array(z.number().int()),
    })),
});

const answer = await ask(
    'You answer questions using only a numbered set of tweets from a personal collection. ' +
    'Write the answer as a short sequence of claims, each one or two sentences, that read well in order. ' +
    'Every claim cites the tweet numbers it rests on. Use only what the tweets say; ' +
    'if they do not answer the question, make one claim saying so, citing nothing.',
    `Tweets:\n${numbered}\n\nQuestion: ${question}`,
    Answer,
);

const Verdicts = z.object({
    verdicts: z.array(z.object({
        claim: z.number().int(),
        tweet: z.number().int(),
        supported: z.boolean(),
    })),
});

const pairs = answer.claims.flatMap((c, i) => c.tweets.map(t => ({ claim: i + 1, tweet: t })));
const check = pairs.length === 0 ? { verdicts: [] } : await ask(
    'You check citations. For each (claim, tweet) pair, say whether the tweet supports the claim: ' +
    'the claim must follow from what the tweet says, not merely share its topic.',
    `Tweets:\n${numbered}\n\nClaims:\n${answer.claims.map((c, i) => `${i + 1}. ${c.text}`).join('\n')}\n\n` +
    `Pairs to judge:\n${pairs.map(p => `claim ${p.claim}, tweet ${p.tweet}`).join('\n')}`,
    Verdicts,
);

const verdict = new Map(check.verdicts.map(v => [`${v.claim}:${v.tweet}`, v.supported]));
console.log(`\n${question}\n`);
answer.claims.forEach((c, i) => {
    const cites = c.tweets.map(t => {
        if (t < 1 || t > sources.length) return `[${t}?]`;  // cited a tweet that wasn't given
        return verdict.get(`${i + 1}:${t}`) === false ? `[${t}✗]` : `[${t}]`;
    });
    console.log(`${c.text} ${cites.join('')}`);
});
console.log('\nSources:');
sources.forEach((t, i) => console.log(`[${i + 1}] @${t.author} ${t.url}`));
const supported = check.verdicts.filter(v => v.supported).length;
console.log(`\nCitation check: ${supported} of ${pairs.length} citations supported (✗ marks the rest).`);
