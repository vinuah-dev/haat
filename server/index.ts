// Haat game server: serves the web UI and runs games in memory.
//
//   node server/index.ts            offline (local ledger)
//   HAAT_CHAIN=testnet node server/index.ts   mirror every day to NEAR testnet (see chain/README.md)

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalLedger } from '../chain/ledger.ts';
import type { Ledger } from '../chain/ledger.ts';
import { getGame, newGame, parseMoves, playDay, publicState } from './game.ts';

const ROOT = resolve(fileURLToPath(new URL('../web', import.meta.url)));
const PORT = Number(process.env.PORT ?? 5173);

async function makeLedger(): Promise<Ledger> {
  if (process.env.HAAT_CHAIN !== 'testnet') return new LocalLedger();
  const { NearLedger } = await import('../chain/near.ts');
  return NearLedger.fromEnv();
}

const ledger = await makeLedger();

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) throw new Error('request too large');
  }
  return raw ? JSON.parse(raw) : {};
}

async function api(req: IncomingMessage, res: ServerResponse, path: string) {
  if (req.method === 'POST' && path === '/api/games') {
    const body = (await readJson(req)) as { mode?: string; seed?: number };
    const game = newGame(body.mode === 'watch' ? 'watch' : 'play', body.seed);
    return send(res, 201, publicState(game, ledger));
  }
  const m = path.match(/^\/api\/games\/([0-9a-f-]{36})(\/day)?$/);
  if (m) {
    const game = getGame(m[1]);
    if (!game) return send(res, 404, { error: 'game not found (the server may have restarted)' });
    if (req.method === 'GET' && !m[2]) return send(res, 200, publicState(game, ledger));
    if (req.method === 'POST' && m[2]) {
      await playDay(game, ledger, parseMoves(await readJson(req)));
      return send(res, 200, publicState(game, ledger));
    }
  }
  if (req.method === 'GET' && path === '/api/health') return send(res, 200, { ok: true, network: ledger.network });
  send(res, 404, { error: 'no such endpoint' });
}

async function staticFile(res: ServerResponse, path: string) {
  const file = normalize(join(ROOT, path === '/' ? 'index.html' : path));
  if (!file.startsWith(ROOT)) return send(res, 403, { error: 'forbidden' });
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    send(res, 404, { error: 'not found' });
  }
}

createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname;
  try {
    if (path.startsWith('/api/')) await api(req, res, path);
    else if (req.method === 'GET') await staticFile(res, decodeURIComponent(path));
    else send(res, 405, { error: 'method not allowed' });
  } catch (e) {
    send(res, 400, { error: (e as Error).message });
  }
}).listen(PORT, () => {
  console.log(`Haat on http://localhost:${PORT} · ledger: ${ledger.network}`);
});
