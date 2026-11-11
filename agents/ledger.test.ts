import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LocalLedger } from '../chain/ledger.ts';
import { commitHash } from '../engine/commit.ts';
import { parseMoves } from '../server/game.ts';
import { createTown } from './roster.ts';

test('every reveal carries what is needed to recompute its commit hash', () => {
  const town = createTown({ seed: 3, withPlayer: true, playerStrategy: 'adaptive' });
  for (let d = 0; d < 5; d++) {
    town.beginDay();
    const log = town.finishDay();
    for (const r of log.rounds) {
      for (const v of r.reveals) {
        const c = r.commits.find((x) => x.account === v.account)!;
        assert.equal(commitHash(r.spec.id, v.account, v.units, v.price, v.salt), c.hash);
      }
    }
  }
});

test('the local ledger gives every commit, reveal and payment a reference', async () => {
  const town = createTown({ seed: 11 });
  town.beginDay();
  const log = town.finishDay();
  const txs = await new LocalLedger().recordDay(log);
  for (const r of log.rounds) {
    const t = txs.rounds[r.spec.id];
    assert.equal(Object.keys(t.commits).length, r.commits.length);
    assert.equal(Object.keys(t.reveals).length, r.reveals.length);
    assert.equal(t.payments.length, log.payments.filter((p) => p.round === r.spec.id).length);
  }
  assert.deepEqual(txs.errors, []);
});

test('player moves from the browser are cleaned up', () => {
  const m = parseMoves({ produce: { grain: '4', bread: -3, tools: 1e9, cloth: 'x' }, asks: { grain: { units: 2.7, price: 5 }, bread: { units: 3 } } });
  assert.deepEqual(m.produce, { grain: 4, tools: 100 });
  assert.deepEqual(m.asks, { grain: { units: 2, price: 5 } });
  assert.deepEqual(parseMoves(null), { produce: {}, asks: {} });
});
