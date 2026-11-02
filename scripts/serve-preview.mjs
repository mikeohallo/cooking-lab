#!/usr/bin/env node
// Serves the web preview's export (`npm run preview:web`) on this computer
// only: http://127.0.0.1:8090 by default (0.4.0, part 7).
//
//   npm run preview:serve            # port 8090
//   npm run preview:serve -- 8095    # another port
//
// Node's own http module and nothing else, so it adds no package. Listens on
// 127.0.0.1 only, never on the network. Any path that is not a file gets
// index.html, so the app's own routes (/cook/<id>, /household) load directly.
//
// Headers: `.wasm` is served as application/wasm, which the browser needs to
// compile SQLite. The preview uses expo-sqlite's async calls only, which need
// no SharedArrayBuffer, so the cross-origin isolation headers are not needed;
// they are sent anyway (COOP same-origin, COEP require-corp) because
// expo-sqlite's web build asks for them, and every file the preview loads is
// its own. See build-control/PREVIEW.md.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)), 'preview-web');
const port = Number(process.argv[2] ?? 8090);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const wanted = normalize(join(root, pathname));
  const inside = wanted === root || wanted.startsWith(root + sep);
  const file = inside && isFile(wanted) ? wanted : join(root, 'index.html');
  if (!isFile(file)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('No preview export here. Run npm run preview:web first.\n');
    return;
  }
  response.writeHead(200, {
    'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  });
  createReadStream(file).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Cooking Lab preview: http://127.0.0.1:${port}/  (Ctrl+C to stop)`);
});
