# Design: answering questions from the tweets with a small model in the browser

This is the working plan for adding retrieval augmented generation (RAG) to the best-tweets site. It records the architecture, each decision and the reason for it, the eval plan, and what is still open. Update it whenever a decision changes. SEARCH.md is the public write-up, and this file is the record of how we got there.

## Goal

A visitor types a question, e.g., "how do I make friends as an adult?", and gets a short answer built only from the tweets in the collection, with each sentence citing the tweets it rests on. Everything runs in the visitor's browser. There is no server and no API key, so the site stays a static GitHub Pages site and costs nothing to run.

The project has two halves. The build half is the in-browser pipeline. The eval half measures how faithful the small model's answers are, because small models tend to cite the wrong tweet or add claims the tweets don't make.

## Architecture

The pipeline has four steps, all in the browser:

1. **Retrieve.** Meaning search (already built, see SEARCH.md) embeds the question and ranks the tweets by cosine similarity. The top K tweets become the context.
2. **Prompt.** The page numbers those K tweets [1] to [K] and puts them in a short prompt with fixed instructions to answer only from them and cite tweet numbers.
3. **Generate.** A small instruction model, run by transformers.js on the visitor's GPU through WebGPU, writes the answer token by token, and the page shows the tokens as they arrive.
4. **Show.** The page turns each [n] into a link to tweet n in a numbered source list under the answer, and flags any number outside 1 to K.

Before step 3, the page checks the best tweet's similarity to the question, and answers "The tweets don't cover this." without running the model when it is too low (decision 12).

Files:

- `rag-config.js` (shared, like `search-config.js`) holds the model name, the weights format, K, the prompts, the similarity cutoff, the decoding settings and the answer parser. The page, ask.mjs and the eval page all import it.
- `index.html` has the Ask button and the code that runs the four steps.
- `ask.mjs` answers one question from the command line, in Node, with the same model and prompt (`lib/generator.mjs`, `lib/rankers.mjs`).
- `eval/generate.html` runs the question set through a model in the browser (decision 8), and `eval/serve.mjs` serves the site locally and saves each run to `eval/rag-runs/`.
- `eval/rag-judge-prep.mjs` turns runs into batches for the judge, whose verdicts go in `eval/rag-verdicts/`, and `eval/rag-score.mjs` prints the results.
- `eval/rag-check.html`, `eval/rag-check-sample.mjs` and `eval/rag-agree.mjs` let Adam judge a sample by hand and compare with the judge.

## Decisions

| # | Decision | Reason |
|---|---|---|
| 1 | Generate in the visitor's browser, not on a server or through an API. | The site stays static and free, and no API key can leak. The tradeoff is a one-time model download and the need for WebGPU. |
| 2 | Use transformers.js for generation, the library that already does the embeddings. | One library and one browser cache for both models. It also runs in Node from the same model files, which means the eval can run the exact model the browser runs. We checked this on 11/1: Qwen2.5-0.5B-Instruct in q4f16 loaded and generated in Node. WebLLM was the main alternative. (Decision 8 later moved the eval itself into the browser, but one library still means one cache and one prompt path.) |
| 3 | Use q4f16 weights where the model works with them, and q4 otherwise. | q4f16 (4-bit weights, 16-bit math) is the smallest format and the fastest on WebGPU. But on 11/1, Qwen2.5-0.5B in q4f16 on WebGPU fell into a loop ("as a person as a person ...") while the same files gave sensible text on CPU, and its q4 files (4-bit weights, 32-bit math) worked on WebGPU. So the weights format is chosen per model, and checked in the browser. |
| 4 | Use greedy decoding (always pick the most likely next token). | The same question gives the same answer every time, so eval runs can be reproduced and compared. |
| 5 | Replace the Claude API version of ask.mjs with the local small model. | No keys anywhere in the project. The Claude version was never run, because there was no key. |
| 6 | Answer in plain sentences with [n] citations, not JSON. | Small models break JSON often, and transformers.js has no way to force valid JSON. Bracketed numbers are easy to parse and to check. |
| 7 | Load the generator only when someone asks a question. | Visitors who only browse or search never download it. |
| 8 | Run the generation eval in a browser on WebGPU (eval/generate.html), not in Node. | Decision 3's finding showed that the GPU and the CPU can give different answers from the same files, and greedy decoding turns tiny numeric differences into different text. Visitors get the GPU answers, so the eval measures those. eval/serve.mjs serves the site locally and saves each run's answers into eval/rag-runs/. ask.mjs still uses Node, for convenience. |
| 9 | Only consider models whose download is under about 1 GB, or whose weights are split into a separate data file. | On 11/1, Qwen3-1.7B (one 1.36 GB file) failed to load in the browser with an out-of-memory error, because the browser's WebAssembly memory can't hold a file that size. Llama-3.2-1B (about 1 GB, split into two files) loaded fine. |
| 10 | Let the judge decide whether an answer declines an off-topic question, instead of matching a phrase. | Models decline in their own words, e.g., "None of the tweets mention a specific pizza place," so a fixed phrase misses real refusals. |
| 11 | Keep prompt v1. Prompt v2 was tried and dropped. | The dev half of v1's answers showed models using [1], [2], [3] as list numbers instead of tweet numbers, answering off-topic questions anyway, and running long. Prompt v2 added a worked example with citations out of order, a 3-sentence limit, and a reminder at the end of the question. It made answers less faithful for all three models: on the dev half, supported claims fell from 70% to 56% (Qwen3-0.6B), 31% to 18% (LFM2-1.2B) and 32% to 26% (LFM2-700M), and the test half moved the same way. Both prompts stay in rag-config.js so the runs can be reproduced. |
| 12 | Skip the model when the best tweet's similarity to the question is below 0.33, and answer "The tweets don't cover this." | No model declined off-topic questions reliably (the best declined 2 of 6). Retrieval scores separate them cleanly: on 11/1 all 6 off-topic questions scored 0.28 or less against their best tweet, and all 30 on-topic questions 0.38 or more. The cutoff declined all 6 and skipped none of the 30. Six off-topic questions are thin evidence, and an off-topic question phrased in relationship words would pass the cutoff, so the model still needs to decline on its own sometimes. |
| 13 | Parse citations in two styles, leading ("[2] x.") and trailing ("x [2]."). | The first parser read every citation as trailing. Models that put the citation first then had every citation shifted back one sentence, and the judge marked the right claims unsupported. One judge noticed the pattern. Fixing the parser raised Qwen3-0.6B from 32 supported units of 91 to 53 of 76, and all runs were judged again. |
| 14 | Use Qwen3-0.6B (q4f16, 543 MB) with K = 5. | It had the most faithful answers by a wide margin (68% of claims supported, 86% supported or partly; the next best was 35% and 69%), and it is one of the smaller downloads. K = 3 beat K = 5 on the dev half (83% to 70%) but lost on the test half (55% to 67%) and tied overall (67% to 68%), so with about 30 units per half the two are within noise. The strict dev-half rule would pick 3; I kept 5 because the halves disagree and 5 gives the model more to draw on. K = 8 was worse on both halves (44% overall). |
| 15 | Generation in the browser is deterministic. | The shipping configuration, run twice on WebGPU, gave word-for-word identical answers to all 30 on-topic questions, so its verdicts carry over and a visitor gets the same answer the eval scored. |

## Eval plan

The eval answers one question: of the claims a model makes, how many are supported by the tweets it cites?

**Questions.** There are 36 questions in eval/questions.json. 30 are natural questions written from the 30 retrieval queries, e.g., "courage" becomes "What do the tweets say about finding courage?", so retrieval quality for each one is already known. 6 are off topic, e.g., "What's the best pizza in Austin?", and a faithful model should say the tweets don't cover them.

**Metrics.**

- Citation validity is the share of citations that point to a tweet number that exists (1 to K). It is checked by code.
- Supported is the share of claim units (sentences, or passages after a leading citation) that Claude judges supported by the tweets they cite, following a written rubric (eval/rag-judge-rubric.md). "Supported or partly" adds the units whose main idea is supported but that add something. Adam spot-checks a sample, as with the retrieval labels.
- Responsive is the share of answers that respond to the question at all.
- Off-topic declined is how many of the 6 off-topic questions got a refusal, from the model or from the similarity cutoff.
- Cost is the download size and the time to answer, measured in the browser.

**Models compared.** We screened candidates with one question in the browser on 11/1, then ran the full question set on the five that produced sensible text. The results are below, under Results, and in SEARCH.md.

| Model | Format | Download | Screening result |
|---|---|---|---|
| SmolLM2-360M-Instruct | q4f16 | 260 MB | Copied the tweets out and didn't answer (tested in Node). Dropped. |
| Qwen2.5-0.5B-Instruct | q4 | 749 MB | Sensible, but no citations. In q4f16 it looped on WebGPU. Kept as a baseline. |
| Qwen3-0.6B | q4f16 | 543 MB | Sensible, cites tweets before each sentence. Kept. |
| LFM2-700M | q4f16 | 473 MB | Sensible, cites. Kept. |
| gemma-3-1b-it | q4f16 | 727 MB | Copied the tweets out word for word. Dropped. |
| Llama-3.2-1B-Instruct | q4f16 | 1,039 MB | Generic advice not in the tweets, with blanket citations. Kept as a contrast, since it's a popular choice. |
| LFM2-1.2B | q4f16 | 725 MB | Short paraphrases, a citation on every sentence. Kept. |
| Qwen3-1.7B, Qwen2.5-1.5B, SmolLM2-1.7B | q4f16 | 1.1 to 1.4 GB, one file | Too large to load in the browser (decision 9). |

**Prompt tuning.** If we revise the prompt after seeing the first results, we tune it on half the questions (dev: every other on-topic question and 3 off-topic ones) and report the other half (test), so the reported numbers aren't tuned to the questions they're measured on. eval/rag-score.mjs takes --split dev or --split test.

## Status

- [x] Merge the semantic search branch into current main (branch rag), re-embed the 583 tweets, rerun the retrieval eval.
- [x] Confirm a small model runs in Node from the browser's model files.
- [x] Probe the candidate models and pick the ones worth evaluating.
- [x] Write rag-config.js, the prompt, and the answer parser.
- [x] Write the 36 questions.
- [x] Build the Ask feature on the page; it works end to end in the browser pane.
- [x] Run the generation eval, judge it, and choose the default model and K (decision 14).
- [x] Test the Ask feature in the browser with the chosen model.
- [x] Update SEARCH.md, README and the repo's CLAUDE.md.
- [ ] Adam spot-checks 25 answer units in eval/rag-check.html; run node eval/rag-agree.mjs.
- [ ] Test on Adam's own Chrome and on a phone.
- [ ] Publish (needs Adam's go-ahead).

## Results (11/1)

All numbers are for the 30 on-topic questions unless noted, with K = 5 and prompt v1. A unit is one sentence, or for models that cite before the text, the passage after each citation. Supported is the share of claim units the judge marked supported.

| Model | Download | Valid citations | Supported | Supported or partly | Off-topic declined by the model | Seconds per answer |
|---|---|---|---|---|---|---|
| Qwen3-0.6B | 543 MB | 100% | 68% | 86% | 1 of 6 | 1.1 |
| LFM2-1.2B | 725 MB | 97% | 35% | 69% | 2 of 6 | 1.3 |
| LFM2-700M | 473 MB | 93% | 25% | 48% | 0 of 6 | 1.1 |
| Llama-3.2-1B-Instruct | 1,039 MB | 67% | 25% | 49% | 0 of 6 | 2.1 |
| Qwen2.5-0.5B-Instruct (q4) | 749 MB | none cited | 0% | 0% | 0 of 6 | 1.8 |

With the similarity cutoff (decision 12), all 6 off-topic questions are declined before the model runs.

The judge is Claude, following eval/rag-judge-rubric.md, with the runs labeled A to J so the judge could not tell which model wrote them. Run files are in eval/rag-runs/ and verdicts in eval/rag-verdicts/; node eval/rag-score.mjs prints the table, and --split dev or --split test prints one half.

## Open questions

- Whether a different way of labeling tweets would stop the models from using [1], [2], [3] as list numbers, e.g., letters instead of numbers. Prompt wording didn't fix it (decision 11).
- Whether 30 questions are enough. The K comparison (decision 14) showed that a 13-point difference on one half can reverse on the other. More questions would make the comparisons firmer.
- What the page does without WebGPU, e.g., in Safari on an older iPhone. The plan is to hide the Ask button and say why.
