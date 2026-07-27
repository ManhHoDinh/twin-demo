/* Static file server for E2E (no dependencies).
   Inherited from SkyLabs_SURF2026/scripts/serve.mjs — including the EADDRINUSE fallback,
   which exists because a previous QA run that did not clean up would otherwise make the
   whole suite die on startup instead of just picking another port. Callers must read the
   real port from srv.address().port rather than assuming the constant.

   The site-specific _headers/CSP logic from the original is dropped: this app is a plain
   static bundle with no header rules to emulate. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

export function createServer(root = ROOT) {
  const server = http.createServer((req, res) => {
    /* the browser cancels requests while panning the map fast; a stray ECONNRESET
       must not take the test process down mid-suite */
    req.on('error', () => {});
    res.on('error', () => {});
    const url = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
    let file = path.join(root, url);
    if (!file.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
    try {
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found: ' + url); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(fs.readFileSync(file));
    } catch (e) {
      res.writeHead(500, { 'content-type': 'text/plain' }).end(String(e));
    }
  });
  server.on('clientError', (err, socket) => socket.destroy());
  return server;
}

export function listen(port = 4310, root = ROOT) {
  return new Promise((resolve, reject) => {
    const srv = createServer(root);
    let retried = false;
    srv.on('error', (e) => {
      if (e.code === 'EADDRINUSE' && !retried) { retried = true; srv.listen(0, '127.0.0.1'); }
      else reject(e);
    });
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[2] || 4310);
  listen(port).then((s) => console.log(`serving ${ROOT} on http://127.0.0.1:${s.address().port}`));
}
