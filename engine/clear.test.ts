import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearMarket } from './clear.ts';
import type { Order } from './types.ts';

let seq = 0;
const bid = (account: string, units: number, price: number): Order => ({ account, side: 'buy', units, price, seq: seq++ });
const ask = (account: string, units: number, price: number): Order => ({ account, side: 'sell', units, price, seq: seq++ });
const unitsOf = (r: ReturnType<typeof clearMarket>, account: string) => r.fills.find((f) => f.account === account)?.units ?? 0;

test('worked example from RULES.md clears 7 units at 6', () => {
  const r = clearMarket([bid('A', 4, 9), bid('B', 3, 7), bid('C', 5, 5), ask('S1', 5, 4), ask('S2', 4, 6), ask('Player', 6, 8)]);
  assert.equal(r.price, 6);
  assert.equal(r.units, 7);
  assert.equal(unitsOf(r, 'A'), 4);
  assert.equal(unitsOf(r, 'B'), 3);
  assert.equal(unitsOf(r, 'C'), 0);
  assert.equal(unitsOf(r, 'S1'), 5);
  assert.equal(unitsOf(r, 'S2'), 2);
  assert.equal(unitsOf(r, 'Player'), 0);
  assert.deepEqual(r.matches, [
    { buyer: 'A', seller: 'S1', units: 4 },
    { buyer: 'B', seller: 'S1', units: 1 },
    { buyer: 'B', seller: 'S2', units: 2 },
  ]);
});

test('no trade when every bid is below every ask', () => {
  const r = clearMarket([bid('A', 3, 4), ask('S', 3, 5)]);
  assert.equal(r.price, null);
  assert.equal(r.units, 0);
  assert.deepEqual(r.matches, []);
});

test('empty sides clear nothing', () => {
  assert.equal(clearMarket([]).price, null);
  assert.equal(clearMarket([bid('A', 2, 9)]).price, null);
  assert.equal(clearMarket([ask('S', 2, 1)]).price, null);
});

test('price never above a winning bid or below a winning ask', () => {
  for (let k = 0; k < 500; k++) {
    const orders: Order[] = [];
    for (let i = 0; i < 6; i++) orders.push(bid(`b${i}`, 1 + ((k * 7 + i * 3) % 5), 1 + ((k * 13 + i * 5) % 12)));
    for (let i = 0; i < 4; i++) orders.push(ask(`s${i}`, 1 + ((k * 11 + i * 7) % 6), 1 + ((k * 17 + i * 3) % 12)));
    const r = clearMarket(orders);
    if (r.price === null) continue;
    for (const f of r.fills) {
      const o = orders.find((x) => x.account === f.account)!;
      if (o.side === 'buy') assert.ok(r.price <= o.price, `buyer ${o.account} pays ${r.price} > bid ${o.price}`);
      else assert.ok(r.price >= o.price, `seller ${o.account} gets ${r.price} < ask ${o.price}`);
      assert.ok(f.units <= o.units);
    }
    const bought = r.fills.filter((f) => f.side === 'buy').reduce((s, f) => s + f.units, 0);
    const sold = r.fills.filter((f) => f.side === 'sell').reduce((s, f) => s + f.units, 0);
    assert.equal(bought, r.units);
    assert.equal(sold, r.units);
    assert.equal(r.matches.reduce((s, m) => s + m.units, 0), r.units);
  }
});

test('equal prices go to the earlier commit', () => {
  const r = clearMarket([ask('late', 2, 5), bid('B', 2, 9)].map((o, i) => ({ ...o, seq: i === 0 ? 10 : 0 })).concat([{ account: 'early', side: 'sell', units: 2, price: 5, seq: 1 }]));
  assert.equal(unitsOf(r, 'early'), 2);
  assert.equal(unitsOf(r, 'late'), 0);
});

test('the marginal seller can be partly filled', () => {
  const r = clearMarket([bid('A', 5, 10), ask('S1', 3, 2), ask('S2', 4, 3)]);
  assert.equal(r.units, 5);
  assert.equal(unitsOf(r, 'S1'), 3);
  assert.equal(unitsOf(r, 'S2'), 2);
  assert.equal(r.price, Math.floor((10 + 3) / 2));
});

test('rejects fractional or negative numbers', () => {
  assert.throws(() => clearMarket([bid('A', 1.5, 3)]));
  assert.throws(() => clearMarket([ask('S', 1, -2)]));
});
