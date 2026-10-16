import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/') { res.writeHead(302, { Location: '/web/index.html' }); res.end(); return; }
    const relative = pathname.slice(1);
    // Only expose public app assets; never serve .git or arbitrary project files.
    if (!['web/', 'dist/', 'examples/'].some(prefix => relative.startsWith(prefix))) throw new Error('not public');
    const target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep) || !(await stat(target)).isFile()) throw new Error('not a file');
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(await readFile(target));
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`MoonWitness: http://127.0.0.1:${port}`));
