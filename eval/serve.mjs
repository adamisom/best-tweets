// Local server for running the RAG eval in a browser: serves the repo like GitHub Pages
// does, and saves results that eval/generate.html POSTs to /save?name=<file>.json.
// Usage: node eval/serve.mjs   (then open http://127.0.0.1:8765/eval/generate.html?...)
// Listens on 127.0.0.1 only.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const runs = path.join(root, 'eval', 'rag-runs');
const PORT = 8765;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.bin': 'application/octet-stream', '.md': 'text/plain', '.css': 'text/css', '.txt': 'text/plain' };

http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (req.method === 'POST' && url.pathname === '/save') {
        const name = path.basename(url.searchParams.get('name') || '');
        if (!/^[\w.-]+\.json$/.test(name)) { res.writeHead(400).end('bad name'); return; }
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            fs.mkdirSync(runs, { recursive: true });
            fs.writeFileSync(path.join(runs, name), body);
            console.log(`saved eval/rag-runs/${name}`);
            res.writeHead(200).end('saved');
        });
        return;
    }
    const file = path.join(root, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root) || file.includes(`${path.sep}node_modules${path.sep}`) || path.basename(file).startsWith('.')) {
        res.writeHead(404).end(); return;
    }
    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404).end(); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(data);
    });
}).listen(PORT, '127.0.0.1', () => console.log(`http://127.0.0.1:${PORT}/`));
