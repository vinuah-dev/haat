import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Town } from '../engine/town.ts';
import { createTown } from './roster.ts';

function play(seed: number, days: number, withPlayer = false) {
  const town = createTown({ seed, withPlayer, playerStrategy: withPlayer ? 'adaptive' : undefined });
  const start = town.totalCoins();
  let flow = 0;
  for (let d = 0; d < days; d++) {
    town.beginDay();
    const log = town.finishDay();
    flow += log.ledger.income - log.ledger.productionSpend - log.ledger.bondsToTown;
  }
  return { town, start, flow };
}

test('the town has 20 buyers and 5 sellers with their own accounts', () => {
  const town = createTown();
  assert.equal(town.buyers.length, 20);
  assert.equal(town.sellers.length, 5);
  const names = [...town.buyers, ...town.sellers].map((a) => a.account);
  assert.equal(new Set(names).size, 25);
});

test('the same seed replays the same market', () => {
  const a = play(7, 10, true).town;
  const b = play(7, 10, true).town;
  assert.deepEqual(a.log, b.log);
  assert.notDeepEqual(a.log, play(8, 10, true).town.log);
});

test('every coin is accounted for and nobody goes negative', () => {
  for (const seed of [1, 2, 3, 42, 99, 2026]) {
    const { town, start, flow } = play(seed, 15, seed % 2 === 0);
    assert.equal(town.totalCoins(), start + flow, `seed ${seed}`);
    for (const a of [...town.buyers, ...town.sellers]) assert.ok(a.coins >= 0, `${a.account} has ${a.coins} coins`);
    for (const s of town.sellers) for (const n of Object.values(s.stock)) assert.ok(n >= 0);
  }
});

test('buyers pay exactly what sellers receive, at the round price', () => {
  const { town } = play(42, 10);
  for (const day of town.log) {
    for (const r of day.rounds) {
      const pays = day.payments.filter((p) => p.round === r.spec.id);
      if (r.clearing.price === null) {
        assert.equal(pays.length, 0);
        continue;
      }
      for (const p of pays) assert.equal(p.amount, p.units * r.clearing.price);
      assert.equal(pays.reduce((s, p) => s + p.units, 0), r.clearing.units);
    }
  }
});

test('the player can play a day by hand', () => {
  const town = createTown({ seed: 5, withPlayer: true });
  const view = town.beginDay();
  const bread = view.swarms.find((s) => s.good === 'bread');
  assert.ok(bread, 'seed 5 day 1 has a bread swarm');
  const log = town.finishDay({ produce: { bread: 4 }, asks: { bread: { units: 4, price: 4 } } });
  const round = log.rounds.find((r) => r.spec.good === 'bread')!;
  assert.ok(round.commits.some((c) => c.account === 'player'));
  const player = town.player!;
  assert.equal(Town.score(player) > 0, true);
});

test('finishDay needs beginDay first', () => {
  const town = createTown();
  assert.throws(() => town.finishDay(), /beginDay/);
  town.beginDay();
  assert.throws(() => town.beginDay(), /has not finished/);
});
