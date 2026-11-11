// Simulation mode (RULES.md section 6): 20 buyers and 5 sellers with scripted
// strategies, no LLM calls, replayable from a seed.
//
//   node sim/run.ts [--seed 42] [--days 10] [--player adaptive] [--out sim/out/run.json]

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { SELLER_STRATEGIES } from '../agents/strategies.ts';
import type { SellerStrategy } from '../agents/strategies.ts';
import { createTown, SELLER_NAMES } from '../agents/roster.ts';
import { EVENTS } from '../engine/economy.ts';
import { Town } from '../engine/town.ts';
import { GOODS } from '../engine/types.ts';

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: '42' },
    days: { type: 'string', default: '10' },
    player: { type: 'string' },
    out: { type: 'string' },
    quiet: { type: 'boolean', default: false },
  },
});

const seed = Number(values.seed);
const days = Number(values.days);
if (!Number.isInteger(seed) || !Number.isInteger(days) || days < 1) throw new Error('--seed and --days must be whole numbers');
if (values.player && !(SELLER_STRATEGIES as readonly string[]).includes(values.player)) {
  throw new Error(`--player must be one of ${SELLER_STRATEGIES.join(', ')}`);
}

const town = createTown({ seed, withPlayer: Boolean(values.player), playerStrategy: values.player as SellerStrategy | undefined });
const startCoins = town.totalCoins();
const say = (s = '') => {
  if (!values.quiet) console.log(s);
};

say(`Haat simulation · seed ${seed} · ${days} days · ${town.buyers.length} buyers, ${town.sellers.length} sellers`);

let income = 0;
let spent = 0;
let toTown = 0;
let forfeits = 0;

for (let d = 0; d < days; d++) {
  const view = town.beginDay();
  const log = town.finishDay();
  income += log.ledger.income;
  spent += log.ledger.productionSpend;
  toTown += log.ledger.bondsToTown;

  const events = view.conditions.events.map((e) => EVENTS[e.name].label.split(':')[0]).join(', ') || 'Calm';
  say(`\nDay ${log.day} · ${events}${log.newEvent ? ' (new)' : ''}`);
  for (const r of log.rounds) {
    const c = r.clearing;
    const lost = r.bonds.forfeited.length;
    forfeits += lost;
    const sellers = c.fills.filter((f) => f.side === 'sell').map((f) => `${SELLER_NAMES[f.account] ?? f.account} ${f.units}`).join(', ');
    say(
      `  ${r.spec.good.padEnd(6)} demand ${String(r.spec.totalDemand).padStart(3)} · ` +
        `${r.commits.length} sealed bids · ` +
        (c.price === null ? 'no trade' : `cleared ${c.units} @ ${c.price}`) +
        (sellers ? ` · sold by ${sellers}` : '') +
        (lost ? ` · ${lost} bond${lost > 1 ? 's' : ''} forfeited` : ''),
    );
  }
}

say('\nSellers after the last day (score = coins + stock at input cost)');
const ranked = [...town.sellers].sort((a, b) => Town.score(b) - Town.score(a));
for (const s of ranked) {
  const name = SELLER_NAMES[s.account];
  const stock = GOODS.filter((g) => s.stock[g] > 0).map((g) => `${g} ${s.stock[g]}`).join(', ') || 'none';
  say(`  ${name.padEnd(7)} ${s.strategy.padEnd(9)} score ${String(Town.score(s)).padStart(4)} · coins ${s.coins} · stock ${stock}`);
}

// Every coin is accounted for: wages come in, production and unclaimed bonds go out, trades only move coins.
const expected = startCoins + income - spent - toTown;
const actual = town.totalCoins();
say(`\nCoin check: start ${startCoins} + wages ${income} - production ${spent} - bonds to town ${toTown} = ${expected}; actual ${actual} ${expected === actual ? 'OK' : 'MISMATCH'}`);
say(`Bonds forfeited: ${forfeits}`);
if (expected !== actual) process.exitCode = 1;

if (values.out) {
  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(values.out, JSON.stringify({ seed, days, sellerNames: SELLER_NAMES, log: town.log, sellers: town.sellers }, null, 2));
  say(`Wrote ${values.out}`);
}
