# Searching my tweets by meaning, and asking them questions

The site has a search mode called "meaning". You type what you're looking for in your own words, e.g., "afraid to talk to a pretty girl", and the site shows the tweets closest in meaning, even when they share none of your words. You can also ask a question, and a small language model running in your browser answers it from the closest tweets, citing them. The whole thing runs in your browser, on a static GitHub Pages site with no server and no API key.

## How to do the same for your own bookmarks

You need your saved tweets (or notes, or quotes) as a list of text, a computer with Node.js, and a static page to show them.

1. **Turn each tweet into a list of numbers.** An embedding model reads a piece of text and returns a fixed list of numbers (here, 384 of them) that places texts with similar meanings close together. I used all-MiniLM-L6-v2, a small free model, run on my laptop with the transformers.js library. All 583 of my tweets took about ten seconds, and the vectors came to 875 KB.
2. **Ship the numbers with the page.** I saved them as one binary file next to index.html, so the site loads them like an image.
3. **Turn the search box text into numbers in the browser.** The page downloads the same model the first time someone searches by meaning, about 23 MB, and the browser caches it after that. Each search then takes a few milliseconds.
4. **Sort by closeness.** Cosine similarity scores how close two lists of numbers point, and the page shows the 30 highest scores. Because the vectors are scaled to length 1, cosine similarity is just a sum of products, which is a short loop in JavaScript.

The one rule that keeps everything working is to embed the tweets and the query with the same model and the same settings. If the two sides differ, the scores are meaningless. In this repo, one file (search-config.js) holds those settings for both sides.

To copy it, start from embed.mjs, search-config.js and search.js in this repo, and the module script at the bottom of index.html.

## How it works, and how I measured it

### Files

- **embed.mjs** loads the tweets from index.html, embeds them, and writes vectors.bin and vectors-meta.json. The meta file lists the tweet URL for each row, because the page shuffles tweets on load and a row number alone would not identify a tweet. I rerun it whenever I add tweets.
- **search-config.js** holds the model name, the 8-bit weights setting and the vector size, so the Node script and the page embed text the same way. I checked that the browser and Node return the same ranking for the same query.
- **search.js** holds the three ways to rank tweets, and both the page and the eval import it, so the eval tests the same code the site runs:
  - BM25, a standard keyword ranking that scores a tweet higher for containing the query's words, more so for rare words;
  - cosine similarity on the embeddings, which is the "meaning" search;
  - hybrid, which merges the two lists with reciprocal rank fusion. Each tweet gets 1 / (60 + its position) from each list, so the two methods' scores never need to be put on the same scale.
- **rag-config.js**, **ask.mjs** and **eval/generate.html** are the question-answering part, described at the end.

### The eval

The eval asks one question: for a set of realistic queries, how many of the good tweets does each method put in its top 10? That share is called recall at 10.

I wrote 30 queries in three kinds. Some use words a tweet uses ("courage"), some paraphrase a tweet's idea ("invite people over more often"), and some name only a concept ("feeling alive").

For each query, I needed to know which tweets are good results. Judging all 583 tweets for each query would take too long, so I used pooling, the usual shortcut. For each query, I took the top 15 from BM25 and the top 15 from meaning search, merged them (about 24 tweets per query, 707 in all), and shuffled them so the judge could not tell which method found which tweet. A tweet outside the pool counts as not relevant.

### Who judged relevance, and how I checked the judge

Claude judged all 707 query and tweet pairs, following a written rubric (eval/judge-rubric.md). To check whether Claude's labels match my taste, I labeled 6 of the 30 queries myself, about 147 tweets, without seeing Claude's labels. Then I compared the two sets with Cohen's kappa. Kappa is the share of agreement after removing the agreement two labelers would reach by chance. 1 means perfect agreement, 0 means chance, and about 0.6 or higher is usually read as solid.

The first rubric told Claude to reject tweets that were only loosely related. On my 6 queries, Claude and I agreed on 79.6% of tweets, with a kappa of 0.54. The disagreements were lopsided, because I marked 22 tweets that Claude rejected, and Claude marked only 8 that I rejected. I read a query for the need behind it, so for "afraid to talk to a pretty girl" I counted practical advice on meeting women, which the first rubric excluded.

I rewrote the rubric to judge by the need behind the query (eval/judge-rubric.md, with the first version kept as judge-rubric-v1.md). The new rubric describes my standard in general words and quotes none of my labels, so that my labels could not leak into Claude's. Claude then judged all 30 queries again. Agreement stayed at 79.6% and kappa rose only to 0.56, but the disagreements became even, at 15 each way. The rubric change removed Claude's lean toward strictness. The disagreements that remain are differences in taste, tweet by tweet, rather than a pattern a rubric can fix. The new rubric was tuned on the same 6 queries it is checked on, so its kappa is, if anything, a little high.

### Results

| Labels | Queries | Keyword (BM25) | Meaning | Hybrid |
|---|---|---|---|---|
| Claude, rubric v2 (the main result) | 30 | 0.352 | 0.644 | 0.560 |
| Claude, rubric v1 | 30 | 0.442 | 0.714 | 0.609 |
| Mine | 6 | 0.329 | 0.679 | 0.465 |

Meaning search wins under all three sets of labels, by a wide margin. Its score also barely changes between the sets, so the result doesn't depend on whose labels I use. Meaning search does best on queries whose good tweets use different words. For "afraid to talk to a pretty girl", on my labels, meaning search found 6 of my 7 good tweets, keyword search found 1, and hybrid search found none.

Hybrid search did worse than meaning search alone. The fusion weights BM25 and meaning search equally, so when BM25's list is poor, its tweets push good meaning results out of the top 10. Hybrid search helped only on queries where both methods found different good tweets, e.g., "keeping friendships going over the years". Because meaning search won, the site offers only two modes, "exact" (the original filter) and "meaning".

Some limits apply to these numbers:

- With 30 queries, a difference of a few hundredths is noise. The gap between meaning and keyword search is about 0.29, which is not.
- Pooling flatters both methods a little, because a good tweet that neither method found counts as not relevant. When I labeled, I could search for tweets I remembered, and I found none outside the pool.
- The labels were made in October, when the collection had 571 tweets. Tweets I've added since were never judged, so they count as not relevant, which lowers every method's score a little. Labels for tweets I've since cut are dropped, because no method could find them.
- One query has more good tweets than fit in a top 10 ("marriage and kids" has 22 under rubric v2), so its recall can't reach 1.0 for any method.
- Giving BM25 less weight in the fusion might help hybrid search, but tuning that weight on these 30 queries would overfit them. It would need a fresh set of queries to test on.

To rerun everything:

```bash
npm install
npm run embed
npm run eval
node eval/agree.mjs --show
```

## Asking the tweets a question

When the search mode is "meaning", an "Ask the tweets" button appears. It runs retrieval augmented generation (RAG) entirely in your browser:

1. Meaning search finds the 5 tweets closest to your question.
2. If even the closest tweet is far from the question (cosine similarity below 0.33), the page says the tweets don't cover it and stops.
3. Otherwise a small language model, Qwen3-0.6B, writes a short answer from those 5 tweets and cites them by number. It runs on your GPU through WebGPU, using transformers.js, the same library that does the meaning search.
4. Each [n] in the answer links to tweet n in a list under it.

The model is a 543 MB download the first time, which the browser then caches, and an answer takes about a second after that. It needs WebGPU, which desktop Chrome and Edge have, and the button explains this when it isn't available. The command line version is `npm run ask -- "your question"`, with the same model and prompt.

### How I measured the answers

Small models tend to cite the wrong tweet, or add advice that no tweet gives, so the eval measures faithfulness: of the claims in an answer, how many are supported by the tweet they cite. I wrote 36 questions (eval/questions.json). 30 are the search queries above rewritten as questions, and 6 are off topic, e.g., "What is the capital of Australia?", where a faithful answer is to decline. Each model answered all 36 in the browser, on WebGPU, because the same model files gave different answers on the GPU and on the CPU, and visitors get the GPU answers. Claude then judged every sentence of every answer against the tweets it cites, following a written rubric (eval/rag-judge-rubric.md), without being told which model wrote which answers.

| Model | Download | Supported | Supported or partly | Off-topic questions the model declined |
|---|---|---|---|---|
| Qwen3-0.6B | 543 MB | 68% | 86% | 1 of 6 |
| LFM2-1.2B | 725 MB | 35% | 69% | 2 of 6 |
| LFM2-700M | 473 MB | 25% | 48% | 0 of 6 |
| Llama-3.2-1B-Instruct | 1,039 MB | 25% | 49% | 0 of 6 |
| Qwen2.5-0.5B-Instruct | 749 MB | 0% (it never cites) | 0% | 0 of 6 |

Qwen3-0.6B, one of the smallest models, gave the most faithful answers by a wide margin, so it's the one on the site. I learned four other things along the way:

- **No model reliably declined off-topic questions, but retrieval could.** Every off-topic question scored 0.28 or less against its closest tweet, and every on-topic one 0.38 or more, so the page declines below 0.33 without running the model. That caught all 6 off-topic questions and none of the 30 on-topic ones. Six questions are thin evidence, so the model still has to decline on its own when an off-topic question happens to sound like the tweets.
- **My first fix to the prompt made things worse.** The models often numbered their sentences [1], [2], [3] in order instead of citing the right tweet. A second prompt with a worked example and a length limit lowered the share of supported claims for all three models I tried it on, so the site uses the first prompt. I tuned prompts on half the questions and checked them on the other half, so the comparison isn't fitted to the questions it's measured on.
- **A bug in my own code made the models look worse than they were.** Some models put the citation before the sentence ("[2] Keep seeing people.") and my first parser assumed it came after, so every citation shifted by one. A judge noticed the pattern. Fixing it raised Qwen3-0.6B's supported share from about a third to two thirds, and I judged every run again.
- **More context is not better for a small model.** With the closest 8 tweets instead of 5, supported claims fell from 68% to 44%. With 3 tweets, the result tied with 5.

Everything is reproducible. eval/serve.mjs serves the site locally and saves runs, eval/generate.html runs a model over the questions, and node eval/rag-score.mjs prints the table from the saved runs and verdicts. DESIGN.md records each decision and the evidence for it.
