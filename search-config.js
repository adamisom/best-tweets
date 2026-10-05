// Shared by embed.mjs (Node) and the page (browser), so both sides embed alike.
export const MODEL = 'Xenova/all-MiniLM-L6-v2';
export const DTYPE = 'q8';   // 8-bit weights: ~23 MB download instead of ~90 MB
export const DIM = 384;

// Text that gets embedded for a tweet: drop the AI-detector tag, keep everything else
// (bracket notes like [QT'ing research] carry real context).
export function embedText(content) {
    return content.replace('(<pangram-says-ai>)', '').trim();
}
