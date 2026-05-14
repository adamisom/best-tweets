# Claude — Maintenance Instructions

Static site of curated tweets, served from `index.html` via GitHub Pages (main branch root, no workflow file). Push → live in ~1 min.

## Adding tweets

Each tweet is a JSON object inside the `tweetsData = [ ... ]` array near the bottom of `index.html`. Append to the end (entries are shuffled at load).

```js
{
        "author": "handle",          // X/Twitter handle, no @
        "url": "https://x.com/handle/status/...",
        "content": "tweet text — keep [bracket annotations] for QTs, my-replies, etc.",
        "category": "#relationships" // or #growth, #wisdom, #misc, #beauty
}
```

## Required updates after adding tweets

For every tweet added, do **all four**:

1. **Categorize.** Pick one of the 5 existing labels. If none fit, ask before introducing a new category. Edge calls: confirm with Adam.
2. **Update header total count.** Edit the literal `<h1>` subtitle string (around line 526): `(last count NNN, aiming to stay <500)` — bump NNN. If the new count would cross the 500 cap, raise both numbers in the same string (e.g. `(last count 512, aiming to stay <600)`); don't let the framing go stale.
3. **Update category counts.** In the JS array near line 905 (`{ label: 'relationships', count: 189 }, …`). Add the per-category deltas.
4. **Update author datalist** (around lines 551–847). If the author isn't already in the `<datalist id="authorsDatalist">`, append `<option value="handle">` near the bottom. The list is roughly sorted by tweet count — single-tweet authors live at the end.

## Other

- Title in `<head>` says `~500 Curated Tweets` — leave alone (approximate).
- Single clean commit per batch. Push to `origin main`.
- Hard-refresh (Cmd+Shift+R) after deploy to bust cache.
