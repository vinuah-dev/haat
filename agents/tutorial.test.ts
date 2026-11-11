import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LocalLedger } from '../chain/ledger.ts';
import { newGame, playDay, TUTORIAL_DAYS } from '../server/game.ts';

// web/tutorial.js tells a story: day 1 your bread sells, day 2 an ask of 12 sells nothing,
// day 3 a festival doubles bread demand. The script forces these exact moves; this checks the story holds.

test('the tutorial town plays out the way the tutorial script says', async () => {
  const ledger = new LocalLedger();
  const g = newGame('tutorial');
  assert.equal(g.totalDays, TUTORIAL_DAYS);
  assert.equal(g.view!.conditions.events.length, 0, 'day 1 is calm');
  assert.ok(g.view!.swarms.some((s) => s.good === 'bread'), 'day 1 has a bread swarm');

  await playDay(g, ledger, { produce: { bread: 4 }, asks: { bread: { units: 4, price: 4 } } });
  const sold1 = g.days[0].log.payments.filter((p) => p.to === 'player').reduce((s, p) => s + p.units, 0);
  assert.ok(sold1 >= 3, `day 1: player sells bread (sold ${sold1})`);

  assert.equal(g.view!.conditions.events.length, 0, 'day 2 is calm');
  const stock = g.town.player!.stock.bread;
  await playDay(g, ledger, { produce: { bread: 3 }, asks: { bread: { units: stock + 3, price: 12 } } });
  assert.equal(g.days[1].log.payments.filter((p) => p.to === 'player').length, 0, 'day 2: an ask of 12 sells nothing');

  assert.ok(g.view!.conditions.events.some((e) => e.name === 'festival'), 'day 3 brings the festival');
  await playDay(g, ledger, {});
  assert.equal(g.view, null, 'the tutorial ends after day 3');
});
