# Faithfulness rubric for the RAG judge

You are checking answers written by a small language model. The model was given a question and a numbered list of tweets, and was told to answer only from those tweets and to cite tweet numbers in brackets. Your job is to judge whether each sentence of the answer is supported by the tweets it cites.

For each sentence you are given its text and the tweet numbers it cites (possibly none). Give one verdict per sentence:

- **supported**: at least one cited tweet states or clearly implies what the sentence says. A fair paraphrase or a summary of the tweet counts. The sentence may be shorter or more general than the tweet.
- **partly**: a cited tweet supports the main idea, but the sentence adds a specific claim, detail or piece of advice that no cited tweet makes.
- **unsupported**: no cited tweet supports the sentence, either because the citations point to tweets about something else or because the sentence cites nothing and makes a claim. Advice that sounds reasonable but is not in the cited tweets is unsupported.
- **no-claim**: the sentence makes no claim that needs support, e.g., "The tweets don't cover this." or a restatement of the question.

Judge only against the cited tweets, not the other tweets in the list. A sentence that cites the wrong number is unsupported even if another tweet in the list would support it. Ignore grammar and style.

For each answer, also say whether the whole answer responds to the question that was asked (yes or no).

Also say whether the answer declines, meaning it says the tweets don't answer the question instead of answering it (yes or no). An answer that says the tweets don't cover the question and then answers anyway counts as no.
