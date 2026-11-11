import type { Need } from '../engine/economy.ts';
import type { Brains, BuyerState, MarketView, Quote, SellerState } from '../engine/town.ts';
import type { Good } from '../engine/types.ts';

/**
 * Scripted strategies (RULES.md section 6). No LLM calls, no randomness:
 * the same public view always gives the same decision.
 */

export const BUYER_STRATEGIES = ['steady', 'bargain', 'panic'] as const;
export const SELLER_STRATEGIES = ['cost-plus', 'adaptive', 'undercut', 'hoarder'] as const;

export type BuyerStrategy = (typeof BUYER_STRATEGIES)[number];
export type SellerStrategy = (typeof SELLER_STRATEGIES)[number];

const MARGIN = 2;

function buyerBid(buyer: BuyerState, need: Need, view: MarketView): Quote {
  const scarce = view.conditions.scarce.includes(need.good);
  switch (buyer.strategy as BuyerStrategy) {
    case 'bargain':
      return { units: need.units, price: Math.floor(need.maxPrice * 0.8) };
    case 'panic':
      return { units: need.units, price: scarce ? Math.ceil(need.maxPrice * 1.2) : need.maxPrice };
    case 'steady':
    default:
      return { units: need.units, price: need.maxPrice };
  }
}

/** Demand for a good today, split across the sellers who make it. */
function fairShare(view: MarketView, good: Good, makers: number): number {
  const demand = view.swarms.find((s) => s.good === good)?.totalDemand ?? 0;
  return Math.ceil(demand / Math.max(1, makers));
}

function sellerProduce(seller: SellerState, view: MarketView, makersOf: (g: Good) => number): Partial<Record<Good, number>> {
  const plan: Partial<Record<Good, number>> = {};
  for (const g of seller.makes) {
    const share = fairShare(view, g, makersOf(g));
    const soldBefore = seller.soldYesterday[g] ?? 0;
    const scarce = view.conditions.scarce.includes(g);
    let target: number;
    switch (seller.strategy as SellerStrategy) {
      case 'cost-plus':
        target = share;
        break;
      case 'adaptive':
        target = Math.max(2, Math.round((share + soldBefore) / 2) + 1);
        break;
      case 'undercut':
        target = share + 2;
        break;
      case 'hoarder':
        // Stock up while things are calm so there is something to sell when they are not.
        target = scarce ? share : share + 4;
        break;
      default:
        target = share;
    }
    plan[g] = Math.max(0, target - seller.stock[g]);
  }
  return plan;
}

function sellerAsk(seller: SellerState, good: Good, view: MarketView): Quote | null {
  const stock = seller.stock[good];
  if (stock <= 0) return null;
  const cost = view.conditions.cost[good];
  const last = view.lastPrice[good];
  const scarce = view.conditions.scarce.includes(good);
  switch (seller.strategy as SellerStrategy) {
    case 'cost-plus':
      return { units: stock, price: cost + MARGIN };
    case 'adaptive': {
      const prev = seller.lastAsk[good] ?? cost + MARGIN;
      const target = last ?? cost + MARGIN;
      const unsold = (seller.soldYesterday[good] ?? 0) === 0 && seller.lastAsk[good] !== undefined;
      const price = Math.round((prev + target) / 2) - (unsold ? 1 : 0);
      return { units: stock, price: Math.max(cost + 1, price) };
    }
    case 'undercut':
      return { units: stock, price: Math.max(cost, (last ?? cost + MARGIN + 1) - 1) };
    case 'hoarder':
      if (scarce) return { units: stock, price: Math.max(cost + MARGIN, Math.ceil((last ?? cost + MARGIN) * 1.3)) };
      return { units: Math.ceil(stock / 2), price: Math.ceil(cost * 1.5) };
    default:
      return { units: stock, price: cost + MARGIN };
  }
}

/** Brains for every scripted agent in a town. */
export function scriptedBrains(sellers: SellerState[]): Brains {
  const makersOf = (g: Good) => sellers.filter((s) => s.makes.includes(g)).length;
  return {
    buyerBid,
    sellerProduce: (s, view) => sellerProduce(s, view, makersOf),
    sellerAsk,
  };
}
