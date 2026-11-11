import { randomUUID } from 'node:crypto';
import { createTown, SELLER_NAMES } from '../agents/roster.ts';
import type { DayTxs, Ledger } from '../chain/ledger.ts';
import { EVENTS } from '../engine/economy.ts';
import { Town } from '../engine/town.ts';
import type { DayLog, MarketView, PlayerMoves, Quote } from '../engine/town.ts';
import { GOODS } from '../engine/types.ts';
import type { Good } from '../engine/types.ts';

export const GAME_DAYS = 10;

export interface Game {
  id: string;
  seed: number;
  mode: 'play' | 'watch';
  town: Town;
  view: MarketView | null;
  days: { log: DayLog; txs: DayTxs }[];
  busy: boolean;
}

const games = new Map<string, Game>();

export function newGame(mode: 'play' | 'watch', seed?: number): Game {
  const s = Number.isInteger(seed) ? seed! : Math.floor(Math.random() * 1_000_000);
  const town = createTown({ seed: s, withPlayer: true, playerStrategy: mode === 'watch' ? 'adaptive' : undefined });
  const game: Game = { id: randomUUID(), seed: s, mode, town, view: town.beginDay(), days: [], busy: false };
  games.set(game.id, game);
  // Keep memory bounded: a public demo server should not grow forever.
  if (games.size > 200) games.delete(games.keys().next().value!);
  return game;
}

export function getGame(id: string): Game | undefined {
  return games.get(id);
}

function cleanInt(v: unknown, max: number): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
}

/** Turn untrusted JSON from the browser into player moves. */
export function parseMoves(body: unknown): PlayerMoves {
  const b = (body ?? {}) as { produce?: Record<string, unknown>; asks?: Record<string, { units?: unknown; price?: unknown }> };
  const produce: Partial<Record<Good, number>> = {};
  const asks: Partial<Record<Good, Quote>> = {};
  for (const g of GOODS) {
    const p = cleanInt(b.produce?.[g], 100);
    if (p) produce[g] = p;
    const a = b.asks?.[g];
    const units = cleanInt(a?.units, 200);
    const price = cleanInt(a?.price, 1000);
    if (units && price) asks[g] = { units, price };
  }
  return { produce, asks };
}

export async function playDay(game: Game, ledger: Ledger, moves?: PlayerMoves): Promise<void> {
  if (!game.view) throw new Error('this game is over');
  if (game.busy) throw new Error('the last day is still being settled');
  game.busy = true;
  try {
    const log = game.town.finishDay(game.mode === 'play' ? moves : undefined);
    let txs: DayTxs;
    try {
      txs = await ledger.recordDay(log);
    } catch (e) {
      txs = { network: ledger.network, rounds: {}, errors: [String((e as Error).message ?? e)] };
    }
    game.days.push({ log, txs });
    game.view = game.town.day < GAME_DAYS ? game.town.beginDay() : null;
  } finally {
    game.busy = false;
  }
}

const nameOf = (account: string) => SELLER_NAMES[account] ?? account;

function eventInfo(view: MarketView) {
  return view.conditions.events.map((e) => ({ name: e.name, label: EVENTS[e.name].label, daysLeft: e.daysLeft, isNew: e.daysLeft === EVENTS[e.name].days }));
}

/** Everything the browser needs. Buyers' private max prices are never sent before their round is over. */
export function publicState(game: Game, ledger: Ledger) {
  const t = game.town;
  const view = game.view;
  const sellers = t.sellers
    .map((s) => ({
      account: s.account,
      accountId: ledger.accountId(s.account),
      name: nameOf(s.account),
      strategy: s.strategy,
      makes: s.makes,
      coins: s.coins,
      stock: s.stock,
      score: Town.score(s),
      isPlayer: s.account === 'player',
    }))
    .sort((a, b) => b.score - a.score);

  const days = game.days.map(({ log, txs }) => ({
    day: log.day,
    events: log.conditions.events.map((e) => EVENTS[e.name].label),
    production: log.production,
    spoiled: log.spoiled,
    rounds: log.rounds.map((r) => ({
      id: r.spec.id,
      good: r.spec.good,
      totalDemand: r.spec.totalDemand,
      buyers: r.spec.buyers.length,
      commits: r.commits.map((c) => ({ ...c, name: nameOf(c.account), tx: txs.rounds[r.spec.id]?.commits[c.account] ?? null })),
      reveals: r.reveals.map((v) => ({ ...v, name: nameOf(v.account), tx: txs.rounds[r.spec.id]?.reveals[v.account] ?? null })),
      price: r.clearing.price,
      units: r.clearing.units,
      fills: r.clearing.fills.map((f) => ({ ...f, name: nameOf(f.account) })),
      bonds: r.bonds,
      payments: (txs.rounds[r.spec.id]?.payments ?? []).map((p) => ({ ...p, fromName: nameOf(p.from), toName: nameOf(p.to) })),
    })),
    chain: { network: txs.network, errors: txs.errors },
  }));

  const player = t.sellers.find((s) => s.account === 'player')!;
  return {
    id: game.id,
    seed: game.seed,
    mode: game.mode,
    network: ledger.network,
    playerAccountId: ledger.accountId('player'),
    day: t.day,
    totalDays: GAME_DAYS,
    finished: view === null,
    bond: t.cfg.bond,
    spoilage: t.cfg.spoilage,
    goods: GOODS,
    today: view && {
      day: view.day,
      events: eventInfo(view),
      cost: view.conditions.cost,
      scarce: view.conditions.scarce,
      lastPrice: view.lastPrice,
      // Members are public when a round opens (RULES.md section 4); their max prices are not.
      swarms: view.swarms.map((s) => ({ good: s.good, buyers: s.members.length, members: s.members, totalDemand: s.totalDemand })),
      rivals: Object.fromEntries(GOODS.map((g) => [g, t.sellers.filter((s) => s.account !== 'player' && s.makes.includes(g)).map((s) => nameOf(s.account))])),
    },
    player: { coins: player.coins, stock: player.stock, score: Town.score(player), rank: sellers.findIndex((s) => s.isPlayer) + 1 },
    sellers,
    // Stall order for the market scene stays fixed, whatever the ranking.
    stallOrder: t.sellers.map((s) => s.account),
    buyers: t.buyers.map((b) => ({ account: b.account, name: nameOf(b.account), role: b.role })),
    days,
  };
}
