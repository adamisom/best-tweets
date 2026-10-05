# Searching my tweets by meaning

The site has a search mode called "meaning". You type what you're looking for in your own words, e.g., "afraid to talk to a pretty girl", and the site shows the tweets closest in meaning, even when they share none of your words. The whole thing runs in your browser, on a static GitHub Pages site with no server and no API key.

## How to do the same for your own bookmarks

You need your saved tweets (or notes, or quotes) as a list of text, a computer with Node.js, and a static page to show them.

1. **Turn each tweet into a list of numbers.** An embedding model reads a piece of text and returns a fixed list of numbers (here, 384 of them) that places texts with similar meanings close together. I used all-MiniLM-L6-v2, a small free model, run on my laptop with the transformers.js library. All 571 of my tweets took about ten seconds, and the vectors came to 857 KB.
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
- **ask.mjs** is a local command that answers a question from the tweets. It is described at the end.

### The eval

The eval asks one question: for a set of realistic queries, how many of the good tweets does each method put in its top 10? That share is called recall at 10.

I wrote 30 queries in three kinds. Some use words a tweet uses ("courage"), some paraphrase a tweet's idea ("invite people over more often"), and some name only a concept ("feeling alive").

For each query, I needed to know which tweets are good results. Judging all 571 tweets for each query would take too long, so I used pooling, the usual shortcut. For each query, I took the top 15 from BM25 and the top 15 from meaning search, merged them (about 24 tweets per query, 707 in all), and shuffled them so the judge could not tell which method found which tweet. A tweet outside the pool counts as not relevant.

### Who judged relevance, and how I checked the judge

Claude judged all 707 query and tweet pairs, following a written rubric (eval/judge-rubric.md). To check whether Claude's labels match my taste, I labeled 6 of the 30 queries myself, about 147 tweets, without seeing Claude's labels. Then I compared the two sets with Cohen's kappa. Kappa is the share of agreement after removing the agreement two labelers would reach by chance. 1 means perfect agreement, 0 means chance, and about 0.6 or higher is usually read as solid.

The first rubric told Claude to reject tweets that were only loosely related. On my 6 queries, Claude and I agreed on 79.6% of tweets, with a kappa of 0.54. The disagreements were lopsided, because I marked 22 tweets that Claude rejected, and Claude marked only 8 that I rejected. I read a query for the need behind it, so for "afraid to talk to a pretty girl" I counted practical advice on meeting women, which the first rubric excluded.

I rewrote the rubric to judge by the need behind the query (eval/judge-rubric.md, with the first version kept as judge-rubric-v1.md). The new rubric describes my standard in general words and quotes none of my labels, so that my labels could not leak into Claude's. Claude then judged all 30 queries again. Agreement stayed at 79.6% and kappa rose only to 0.56, but the disagreements became even, at 15 each way. The rubric change removed Claude's lean toward strictness. The disagreements that remain are differences in taste, tweet by tweet, rather than a pattern a rubric can fix. The new rubric was tuned on the same 6 queries it is checked on, so its kappa is, if anything, a little high.

### Results

| Labels | Queries | Keyword (BM25) | Meaning | Hybrid |
|---|---|---|---|---|
| Claude, rubric v2 (the main result) | 30 | 0.373 | 0.657 | 0.569 |
| Claude, rubric v1 | 30 | 0.467 | 0.715 | 0.617 |
| Mine | 6 | 0.324 | 0.658 | 0.493 |

Meaning search wins under all three sets of labels, by a wide margin. Its score also barely changes between the sets, so the result doesn't depend on whose labels I use. Meaning search does best on queries whose good tweets use different words. For "afraid to talk to a pretty girl", on my labels, meaning search found 7 of my 8 good tweets, and keyword and hybrid search each found 1.

Hybrid search did worse than meaning search alone. The fusion weights BM25 and meaning search equally, so when BM25's list is poor, its tweets push good meaning results out of the top 10. Hybrid search helped only on queries where both methods found different good tweets, e.g., "keeping friendships going over the years". Because meaning search won, the site offers only two modes, "exact" (the original filter) and "meaning".

Some limits apply to these numbers:

- With 30 queries, a difference of a few hundredths is noise. The gap between meaning and keyword search is about 0.28, which is not.
- Pooling flatters both methods a little, because a good tweet that neither method found counts as not relevant. When I labeled, I could search for tweets I remembered, and I found none outside the pool.
- One query has more good tweets than fit in a top 10 ("marriage and kids" has 22 under rubric v2), so its recall can't reach 1.0 for any method.
- Giving BM25 less weight in the fusion might help hybrid search, but tuning that weight on these 30 queries would overfit them. It would need a fresh set of queries to test on.

To rerun everything:

```bash
npm install
npm run embed
npm run eval
node eval/agree.mjs --show
```

### Asking questions of the tweets (retrieval plus generation)

ask.mjs turns the search into retrieval augmented generation (RAG). You run it locally with a question, e.g., `npm run ask -- "how do I get better at small talk?"`. It works in three steps:

1. Meaning search picks the 10 closest tweets.
2. Claude writes an answer using only those tweets, as a short list of claims, and each claim cites the numbers of the tweets it rests on.
3. A second Claude call checks each citation and says whether the tweet supports the claim or only shares its topic. The output marks unsupported citations, and it reports how many citations passed.

It needs an Anthropic API key in a .env file, which git ignores. It stays out of the website, because a static page would have to expose the key.
