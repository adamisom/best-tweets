// Loads tweetsData from index.html (the source of truth), for Node scripts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadTweets() {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const arr = html.match(/tweetsData = \[[\s\S]*?\n\];/)[0];
    return eval(arr.replace('tweetsData =', '').replace(/;$/, ''));
}

export const repoRoot = root;
