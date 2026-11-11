import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commitHash } from './commit.ts';
import { Round } from './round.ts';

function newRound() {
  return new Round({
    id: 'd1-bread',
    good: 'bread',
    buyers: ['b1', 'b2', 'b3'],
    sellers: ['s1', 's2'],
    totalDemand: 9,
    bond: 5,
    sellerStock: { s1: 5, s2: 4 },
  });
}

const h = (account: string, units: number, price: number, salt = 'salt') => commitHash('d1-bread', account, units, price, salt);

test('commit, reveal and clear a round', () => {
  const r = newRound();
  r.commit('b1', 'buy', h('b1', 4, 9));
  r.commit('s1', 'sell', h('s1', 5, 4));
  r.closeCommits();
  assert.equal(r.reveal('b1', 4, 9, 'salt').valid, true);
  assert.equal(r.reveal('s1', 5, 4, 'salt').valid, true);
  const res = r.clear();
  assert.equal(res.clearing.units, 4);
  assert.equal(res.clearing.price, 6);
  assert.deepEqual(res.bonds.refunded.sort(), ['b1', 's1']);
  assert.deepEqual(res.bonds.forfeited, []);
});

test('the commit hash hides the bid until reveal', () => {
  assert.notEqual(h('b1', 4, 9, 'a'), h('b1', 4, 9, 'b'));
  assert.notEqual(h('b1', 4, 9), h('b1', 4, 8));
  assert.match(h('b1', 4, 9), /^[0-9a-f]{64}$/);
});

test('a reveal that does not match its commit forfeits the bond to buyers who revealed', () => {
  const r = newRound();
  r.commit('b1', 'buy', h('b1', 4, 9));
  r.commit('b2', 'buy', h('b2', 2, 7));
  r.commit('s1', 'sell', h('s1', 5, 4));
  r.commit('s2', 'sell', h('s2', 4, 6));
  r.closeCommits();
  r.reveal('b1', 4, 9, 'salt');
  r.reveal('b2', 2, 7, 'salt');
  r.reveal('s1', 5, 4, 'salt');
  const bad = r.reveal('s2', 4, 3, 'salt'); // tries to change its price after seeing nothing; still caught
  assert.equal(bad.valid, false);
  assert.equal(bad.reason, 'does not match commit');
  const res = r.clear();
  assert.deepEqual(res.bonds.forfeited, ['s2']);
  assert.deepEqual(res.bonds.payouts, { b1: 3, b2: 2 });
  assert.equal(res.bonds.unallocated, 0);
  assert.ok(!res.clearing.fills.some((f) => f.account === 's2'));
});

test('missing reveals forfeit; with no honest buyer the bonds go to the town', () => {
  const r = newRound();
  r.commit('b1', 'buy', h('b1', 4, 9));
  r.commit('s1', 'sell', h('s1', 5, 4));
  r.closeCommits();
  r.reveal('s1', 5, 4, 'salt');
  const res = r.clear();
  assert.deepEqual(res.bonds.forfeited, ['b1']);
  assert.deepEqual(res.bonds.payouts, {});
  assert.equal(res.bonds.unallocated, 5);
  assert.equal(res.clearing.price, null);
});

test('a seller cannot ask more than it holds', () => {
  const r = newRound();
  r.commit('s2', 'sell', h('s2', 9, 4));
  r.closeCommits();
  const rec = r.reveal('s2', 9, 4, 'salt');
  assert.equal(rec.valid, false);
  assert.equal(rec.reason, 'asks more units than in stock');
});

test('phase and membership rules', () => {
  const r = newRound();
  assert.throws(() => r.commit('outsider', 'buy', h('outsider', 1, 1)), /cannot buy/);
  assert.throws(() => r.commit('b1', 'sell', h('b1', 1, 1)), /cannot sell/);
  assert.throws(() => r.commit('b1', 'buy', 'not-a-hash'), /sha256/);
  r.commit('b1', 'buy', h('b1', 1, 5));
  assert.throws(() => r.commit('b1', 'buy', h('b1', 1, 6)), /already committed/);
  assert.throws(() => r.reveal('b1', 1, 5, 'salt'), /not in reveal phase/);
  r.closeCommits();
  assert.throws(() => r.commit('b2', 'buy', h('b2', 1, 5)), /commit phase is over/);
  r.reveal('b1', 1, 5, 'salt');
  assert.throws(() => r.reveal('b1', 1, 5, 'salt'), /already revealed/);
  r.clear();
  assert.throws(() => r.clear(), /not in reveal phase/);
});
