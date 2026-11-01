// Shared by the page (browser) and ask.mjs / the eval (Node), so both generate alike.
// See DESIGN.md for why each setting is what it is.

export const GEN_MODEL = 'onnx-community/Qwen3-0.6B-ONNX';   // chosen by the 11/1 eval (DESIGN.md)
export const GEN_DTYPE = 'q4f16';
export const GEN_MODEL_MB = 543;    // download size of GEN_MODEL in GEN_DTYPE, shown on the page
export const K = 5;                 // tweets given to the model as context
export const MAX_NEW_TOKENS = 220;
export const MAX_TWEET_CHARS = 600; // long tweets are cut so the prompt stays short for a small model

export const NO_ANSWER = "The tweets don't cover this.";

// If the best tweet's cosine similarity to the question is below this, the page answers
// NO_ANSWER without running the model. On 11/1 all 6 off-topic eval questions scored 0.28 or
// less and all 30 on-topic ones 0.38 or more (DESIGN.md, decision 12).
export const SKIP_BELOW = 0.33;

// v1: the first prompt, and the one in use. v2: an attempt to fix what the dev half of v1's
// answers showed (models used [1], [2], [3] as list numbers, answered off-topic questions, ran
// long). v2 made answers less faithful for all three models tested, so v1 stays (DESIGN.md, decision 11).
const PROMPTS = {
    v1: {
        system: [
            'You answer questions using only the numbered tweets the user gives you.',
            'Write 2 to 4 short sentences.',
            'End each sentence with the number of the tweet it comes from, in brackets, like [2].',
            'Only use numbers from the list.',
            'Do not add advice or facts that are not in the tweets.',
            `If none of the tweets answer the question, reply exactly: ${NO_ANSWER}`,
        ].join(' '),
        reminder: '',
    },
    v2: {
        system: [
            'You answer questions using only the numbered tweets the user gives you.',
            'Write at most 3 sentences.',
            'End each sentence with the number of the tweet that supports it, in brackets.',
            'The number names a tweet. It is not a list number, so the numbers can come in any order, repeat, or skip.',
            'Only say what the cited tweet says.',
            `If no tweet is about the question, reply only: ${NO_ANSWER}`,
            'Example of the format: Keep seeing the same people until they become friends [3]. Small dinners give them a reason to come back [1].',
        ].join(' '),
        reminder: '\n\nAnswer in at most 3 sentences, each ending with the number of the tweet it comes from.',
    },
};
export const PROMPT_VERSION = 'v1';   // v2 scored worse on the dev half (DESIGN.md, decision 11)

function clip(text) {
    const t = text.replace('(<pangram-says-ai>)', '').trim();
    return t.length > MAX_TWEET_CHARS ? t.slice(0, MAX_TWEET_CHARS) + ' [...]' : t;
}

// Chat messages for the model. tweets are the top K from meaning search, best first.
export function buildMessages(question, tweets, model = GEN_MODEL, version = PROMPT_VERSION) {
    const prompt = PROMPTS[version];
    const list = tweets.map((t, i) => `[${i + 1}] ${clip(t.content)}`).join('\n');
    // Qwen3 models think out loud by default; /no_think turns that off.
    const suffix = /qwen3/i.test(model) ? ' /no_think' : '';
    return [
        { role: 'system', content: prompt.system },
        { role: 'user', content: `Tweets:\n${list}\n\nQuestion: ${question}${prompt.reminder}${suffix}` },
    ];
}

// Removes an empty or leftover thinking block some models emit.
export function cleanOutput(text) {
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

// Splits an answer into sentences and the tweet numbers each one cites.
// Models cite in one of two styles, and the parser has to know which:
//   trailing: "x [2]." or "x. [2]"  (the citation closes its sentence)
//   leading:  "[2] x. [3] y."       (the citation opens its passage, which may run several sentences)
// An answer that starts with a citation is read as leading; anything else as trailing.
// Reading leading citations as trailing shifts every citation back one sentence.
const CITE_GROUP = /\[([\d,\s]+)\]/g;

function citesIn(text) {
    return [...text.matchAll(CITE_GROUP)]
        .flatMap(c => c[1].split(',').map(n => parseInt(n, 10)))
        .filter(n => !Number.isNaN(n));
}

export function parseAnswer(text, k = K) {
    const answer = cleanOutput(text);
    const abstained = /don['’]?t cover|do not cover/i.test(answer);
    const leading = /^\[\d/.test(answer);
    const pieces = leading
        // Split before each citation that opens text (a bracket followed by a letter or quote).
        ? answer.split(/(?=\[[\d,\s]+\]\s*[A-Za-z"“'(*])/)
        : [...answer.matchAll(/[^.!?\n]+(?:[.!?]+|$)(?:\s*\[[\d,\s]+\])*/g)].map(m => m[0]);
    const sentences = [];
    for (const piece of pieces) {
        const raw = piece.trim();
        if (!raw || /^(\[[\d,\s]+\]\s*)+$/.test(raw)) continue;
        const cites = citesIn(raw);
        sentences.push({ text: raw, cites, invalid: cites.filter(n => n < 1 || n > k) });
    }
    return { answer, abstained, sentences, style: leading ? 'leading' : 'trailing' };
}
