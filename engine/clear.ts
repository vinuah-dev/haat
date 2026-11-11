import type { Clearing, Fill, Match, Order } from './types.ts';

function commitOrder(a: Order, b: Order): number {
  if (a.seq !== b.seq) return a.seq - b.seq;
  return a.account < b.account ? -1 : a.account > b.account ? 1 : 0;
}

function checkOrder(o: Order): void {
  if (!Number.isInteger(o.units) || o.units < 0) throw new Error(`bad units from ${o.account}: ${o.units}`);
  if (!Number.isInteger(o.price) || o.price < 0) throw new Error(`bad price from ${o.account}: ${o.price}`);
}

/**
 * Uniform-price call market (RULES.md section 4).
 * Bids are walked highest first, asks lowest first, matching units while
 * bid price >= ask price. The price is the floor of the midpoint of the last
 * matched bid and ask, so no buyer pays above its bid and no seller gets below its ask.
 */
export function clearMarket(orders: Order[]): Clearing {
  orders.forEach(checkOrder);
  const bids = orders
    .filter((o) => o.side === 'buy' && o.units > 0)
    .sort((a, b) => b.price - a.price || commitOrder(a, b));
  const asks = orders
    .filter((o) => o.side === 'sell' && o.units > 0)
    .sort((a, b) => a.price - b.price || commitOrder(a, b));

  const fills = new Map<string, Fill>();
  const addFill = (o: Order, units: number) => {
    const key = `${o.side}|${o.account}`;
    const f = fills.get(key);
    if (f) f.units += units;
    else fills.set(key, { account: o.account, side: o.side, units });
  };
  const matches: Match[] = [];

  let i = 0;
  let j = 0;
  let bidLeft = bids[0]?.units ?? 0;
  let askLeft = asks[0]?.units ?? 0;
  let lastBid = 0;
  let lastAsk = 0;
  let units = 0;

  while (i < bids.length && j < asks.length && bids[i].price >= asks[j].price) {
    const n = Math.min(bidLeft, askLeft);
    addFill(bids[i], n);
    addFill(asks[j], n);
    const prev = matches[matches.length - 1];
    if (prev && prev.buyer === bids[i].account && prev.seller === asks[j].account) prev.units += n;
    else matches.push({ buyer: bids[i].account, seller: asks[j].account, units: n });
    units += n;
    lastBid = bids[i].price;
    lastAsk = asks[j].price;
    bidLeft -= n;
    askLeft -= n;
    if (bidLeft === 0) bidLeft = bids[++i]?.units ?? 0;
    if (askLeft === 0) askLeft = asks[++j]?.units ?? 0;
  }

  if (units === 0) return { price: null, units: 0, fills: [], matches: [] };
  return { price: Math.floor((lastBid + lastAsk) / 2), units, fills: [...fills.values()], matches };
}
