// The game server's API, running inside the browser. Used by the static build (Vercel),
// where there is no server: web/app.js calls window.HaatLocal.call instead of fetch.
//
// A game is saved as its seed plus the player's moves. The engine is deterministic,
// so reloading the page replays those moves and lands on exactly the same state.

import { LocalLedger } from '../chain/ledger.ts';
import { getGame, newGame, parseMoves, playDay, publicState } from '../server/game.ts';
import type { Game, Mode } from '../server/game.ts';
import type { PlayerMoves } from '../engine/town.ts';

const ledger = new LocalLedger();
const KEY = 'haat-local-games';
const KEEP = 5;

interface Saved {
  id: string;
  mode: Mode;
  seed: number;
  moves: (PlayerMoves | null)[];
}

function load(): Saved[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

function save(list: Saved[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-KEEP)));
  } catch {}
}

function remember(game: Game, moves: (PlayerMoves | null)[]) {
  const list = load().filter((s) => s.id !== game.id);
  list.push({ id: game.id, mode: game.mode, seed: game.seed, moves });
  save(list);
}

async function find(id: string): Promise<Game | undefined> {
  const live = getGame(id);
  if (live) return live;
  const saved = load().find((s) => s.id === id);
  if (!saved) return undefined;
  const game = newGame(saved.mode, saved.seed, saved.id);
  for (const m of saved.moves) await playDay(game, ledger, m ?? undefined);
  return game;
}

const movesOf = new Map<string, (PlayerMoves | null)[]>();

type Reply = { status: number; data: unknown };

async function call(method: string, path: string, body?: unknown): Promise<Reply> {
  try {
    if (method === 'POST' && path === '/api/games') {
      const b = (body ?? {}) as { mode?: string; seed?: number };
      const mode: Mode = b.mode === 'watch' || b.mode === 'tutorial' ? b.mode : 'play';
      const game = newGame(mode, b.seed);
      movesOf.set(game.id, []);
      remember(game, []);
      return { status: 201, data: publicState(game, ledger) };
    }
    const m = path.match(/^\/api\/games\/([0-9a-f-]{36})(\/day)?$/);
    if (m) {
      const game = await find(m[1]);
      if (!game) return { status: 404, data: { error: 'game not found' } };
      if (!movesOf.has(game.id)) movesOf.set(game.id, load().find((s) => s.id === game.id)?.moves ?? []);
      if (method === 'GET' && !m[2]) return { status: 200, data: publicState(game, ledger) };
      if (method === 'POST' && m[2]) {
        const moves = game.mode === 'watch' ? null : parseMoves(body);
        await playDay(game, ledger, moves ?? undefined);
        const list = movesOf.get(game.id)!;
        list.push(moves);
        remember(game, list);
        return { status: 200, data: publicState(game, ledger) };
      }
    }
    if (method === 'GET' && path === '/api/health') return { status: 200, data: { ok: true, network: 'local' } };
    return { status: 404, data: { error: 'no such endpoint' } };
  } catch (e) {
    return { status: 400, data: { error: (e as Error).message } };
  }
}

(globalThis as unknown as { HaatLocal: unknown }).HaatLocal = { call };
