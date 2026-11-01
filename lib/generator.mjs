// Answers a question from the tweets with the small model, in Node (same files as the browser).
import { pipeline } from '@huggingface/transformers';
import { GEN_MODEL, GEN_DTYPE, K, MAX_NEW_TOKENS, buildMessages, cleanOutput } from '../rag-config.js';

export async function makeGenerator(model = GEN_MODEL) {
    const gen = await pipeline('text-generation', model, { dtype: GEN_DTYPE });
    // tweets: the top K from meaning search, best first. Greedy decoding, so answers repeat exactly.
    return async (question, tweets) => {
        const out = await gen(buildMessages(question, tweets, model), {
            max_new_tokens: MAX_NEW_TOKENS,
            do_sample: false,
        });
        return cleanOutput(out[0].generated_text.at(-1).content);
    };
}

export { K };
