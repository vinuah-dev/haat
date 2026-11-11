import { commitHash } from './commit.ts';
import { conditionsFor, drawNeed, EVENT_CHANCE, EVENTS, formSwarms, mulberry32, saltFrom } from './economy.ts';
import type { ActiveEvent, Conditions, EventName, Need, Rng, Role, Swarm } from './economy.ts';
import { Round } from './round.ts';
import type { RoundResult } from './round.ts';
import { GOODS, INPUT_COST } from './types.ts';
import type { Good } from './types.ts';

export type Stock = Record<Good, number>;

export function emptyStock(): Stock {
  return Object.fromEntries(GOODS.map((g) => [g, 0])) as Stock;
}

export interface BuyerState {
  account: string;
  role: Role;
  strategy: string;
  coins: number;
}

export interface SellerState {
  account: string;
  /** Goods this seller can make. The player can make all of them. */
  makes: Good[];
  strategy: string;
  coins: number;
  stock: Stock;
  isPlayer: boolean;
  lastAsk: Partial<Record<Good, number>>;
  soldYesterday: Partial<Record<Good, number>>;
}

/** Public information. Every agent, scripted or LLM, and the player see exactly this. */
export interface MarketView {
  day: number;
  conditions: Conditions;
  lastPrice: Partial<Record<Good, number>>;
  swarms: Swarm[];
}

export interface Quote {
  units: number;
  price: number;
}

export interface Brains {
  buyerBid(buyer: BuyerState, need: Need, view: MarketView): Quote;
  sellerProduce(seller: SellerState, view: MarketView): Partial<Record<Good, number>>;
  sellerAsk(seller: SellerState, good: Good, view: MarketView): Quote | null;
}

export interface PlayerMoves {
  produce: Partial<Record<Good, number>>;
  asks: Partial<Record<Good, Quote>>;
}

export interface TownConfig {
  seed: number;
  bond: number;
  buyerIncome: number;
  /** Share of each seller's unsold units lost overnight. */
  spoilage: number;
  /** Chance an agent goes offline and misses its reveal. Never applies to the player. */
  flakyRate: number;
}

export const DEFAULT_CONFIG: TownConfig = { seed: 42, bond: 5, buyerIncome: 25, spoilage: 0.25, flakyRate: 0.02 };

export interface Payment {
  round: string;
  from: string;
  to: string;
  units: number;
  amount: number;
}

export interface DayLog {
  day: number;
  conditions: Conditions;
  newEvent: EventName | null;
  needs: Need[];
  swarms: Swarm[];
  production: Record<string, Partial<Record<Good, number>>>;
  rounds: RoundResult[];
  payments: Payment[];
  spoiled: Record<string, Partial<Record<Good, number>>>;
  /** Coins entering and leaving the town economy today, for the conservation check. */
  ledger: { income: number; productionSpend: number; bondsToTown: number };
}

interface PendingDay {
  view: MarketView;
  needs: Need[];
  newEvent: EventName | null;
  income: number;
}

/** The whole town for one game. Deterministic for a given seed and the same player moves. */
export class Town {
  readonly cfg: TownConfig;
  readonly buyers: BuyerState[];
  readonly sellers: SellerState[];
  readonly brains: Brains;
  readonly log: DayLog[] = [];
  day = 0;
  lastPrice: Partial<Record<Good, number>> = {};
  private events: ActiveEvent[] = [];
  private rng: Rng;
  private pending: PendingDay | null = null;

  constructor(cfg: TownConfig, buyers: BuyerState[], sellers: SellerState[], brains: Brains) {
    this.cfg = cfg;
    this.buyers = buyers;
    this.sellers = sellers;
    this.brains = brains;
    this.rng = mulberry32(cfg.seed);
  }

  get player(): SellerState | undefined {
    return this.sellers.find((s) => s.isPlayer);
  }

  /** Start a day: events, wages, needs and swarms. Returns what everyone gets to see. */
  beginDay(): MarketView {
    if (this.pending) throw new Error(`day ${this.day} has not finished`);
    this.day++;

    this.events = this.events.map((e) => ({ ...e, daysLeft: e.daysLeft - 1 })).filter((e) => e.daysLeft > 0);
    let newEvent: EventName | null = null;
    if (this.rng() < EVENT_CHANCE) {
      const names = (Object.keys(EVENTS) as EventName[]).filter((n) => !this.events.some((e) => e.name === n));
      if (names.length > 0) {
        newEvent = names[Math.floor(this.rng() * names.length)];
        this.events.push({ name: newEvent, daysLeft: EVENTS[newEvent].days });
      }
    }
    const conditions = conditionsFor(this.day, this.events);

    for (const b of this.buyers) b.coins += this.cfg.buyerIncome;
    const income = this.cfg.buyerIncome * this.buyers.length;

    const needs: Need[] = [];
    for (const b of this.buyers) {
      const n = drawNeed(this.rng, b.account, b.role, conditions);
      if (n) needs.push(n);
    }
    const view: MarketView = { day: this.day, conditions, lastPrice: { ...this.lastPrice }, swarms: formSwarms(needs) };
    this.pending = { view, needs, newEvent, income };
    return view;
  }

  /** Production, one sealed-bid round per swarm, settlement, spoilage. */
  finishDay(player?: PlayerMoves): DayLog {
    const p = this.pending;
    if (!p) throw new Error('call beginDay first');
    this.pending = null;
    const { view, needs } = p;
    const cost = view.conditions.cost;
    const bond = this.cfg.bond;
    const log: DayLog = {
      day: this.day,
      conditions: view.conditions,
      newEvent: p.newEvent,
      needs,
      swarms: view.swarms,
      production: {},
      rounds: [],
      payments: [],
      spoiled: {},
      ledger: { income: p.income, productionSpend: 0, bondsToTown: 0 },
    };

    const soldToday = new Map<string, Partial<Record<Good, number>>>();

    // 1. Production. Sellers keep enough coins back to post a bond in every round.
    for (const s of this.sellers) {
      const plan = s.isPlayer ? (player?.produce ?? {}) : this.brains.sellerProduce(s, view);
      const made: Partial<Record<Good, number>> = {};
      for (const g of GOODS) {
        const want = Math.floor(plan[g] ?? 0);
        if (want <= 0 || !s.makes.includes(g)) continue;
        const affordable = Math.max(0, Math.floor((s.coins - bond * GOODS.length) / cost[g]));
        const units = Math.min(want, affordable);
        if (units <= 0) continue;
        s.coins -= units * cost[g];
        s.stock[g] += units;
        made[g] = units;
        log.ledger.productionSpend += units * cost[g];
      }
      log.production[s.account] = made;
    }

    // 2. One round per swarm.
    for (const swarm of view.swarms) {
      const good = swarm.good;
      const sellersHere = this.sellers.filter((s) => s.stock[good] > 0);
      const round = new Round({
        id: `d${this.day}-${good}`,
        good,
        buyers: swarm.members,
        sellers: sellersHere.map((s) => s.account),
        totalDemand: swarm.totalDemand,
        bond,
        sellerStock: Object.fromEntries(sellersHere.map((s) => [s.account, s.stock[good]])),
      });
      const secrets = new Map<string, { units: number; price: number; salt: string; isPlayer: boolean }>();

      for (const need of needs.filter((n) => n.good === good)) {
        const b = this.buyers.find((x) => x.account === need.account)!;
        if (b.coins < bond) continue;
        const q = this.brains.buyerBid(b, need, view);
        const price = Math.max(0, Math.floor(q.price));
        const budgetUnits = price > 0 ? Math.floor((b.coins - bond) / price) : q.units;
        const units = Math.max(0, Math.min(Math.floor(q.units), need.units, budgetUnits));
        if (units === 0) continue;
        const salt = saltFrom(this.rng);
        round.commit(b.account, 'buy', commitHash(round.spec.id, b.account, units, price, salt));
        b.coins -= bond;
        secrets.set(b.account, { units, price, salt, isPlayer: false });
      }

      for (const s of sellersHere) {
        const q = s.isPlayer ? (player?.asks[good] ?? null) : this.brains.sellerAsk(s, good, view);
        if (!q || q.units <= 0 || s.coins < bond) continue;
        // Agents never over-ask. The player's ask is taken as given; RULES.md says an ask above stock is invalid.
        const units = s.isPlayer ? Math.floor(q.units) : Math.min(Math.floor(q.units), s.stock[good]);
        const price = Math.max(0, Math.floor(q.price));
        const salt = saltFrom(this.rng);
        round.commit(s.account, 'sell', commitHash(round.spec.id, s.account, units, price, salt));
        s.coins -= bond;
        s.lastAsk[good] = price;
        secrets.set(s.account, { units, price, salt, isPlayer: s.isPlayer });
      }

      round.closeCommits();
      for (const [account, sec] of secrets) {
        if (!sec.isPlayer && this.rng() < this.cfg.flakyRate) continue; // agent went offline
        round.reveal(account, sec.units, sec.price, sec.salt);
      }
      const result = round.clear();
      log.rounds.push(result);

      const coinsOf = (account: string) => this.buyers.find((b) => b.account === account) ?? this.sellers.find((s) => s.account === account)!;
      for (const a of result.bonds.refunded) coinsOf(a).coins += bond;
      for (const [a, amt] of Object.entries(result.bonds.payouts)) coinsOf(a).coins += amt;
      log.ledger.bondsToTown += result.bonds.unallocated;

      const P = result.clearing.price;
      if (P !== null) {
        this.lastPrice[good] = P;
        for (const m of result.clearing.matches) {
          const amount = m.units * P;
          const buyer = this.buyers.find((b) => b.account === m.buyer)!;
          const seller = this.sellers.find((s) => s.account === m.seller)!;
          buyer.coins -= amount;
          seller.coins += amount;
          seller.stock[good] -= m.units;
          const sold = soldToday.get(seller.account) ?? {};
          sold[good] = (sold[good] ?? 0) + m.units;
          soldToday.set(seller.account, sold);
          log.payments.push({ round: round.spec.id, from: m.buyer, to: m.seller, units: m.units, amount });
        }
      }
    }

    // 3. Overnight: unsold stock spoils, sellers remember what they sold.
    for (const s of this.sellers) {
      const lost: Partial<Record<Good, number>> = {};
      for (const g of GOODS) {
        const n = Math.floor(s.stock[g] * this.cfg.spoilage);
        if (n > 0) {
          s.stock[g] -= n;
          lost[g] = n;
        }
      }
      log.spoiled[s.account] = lost;
      s.soldYesterday = soldToday.get(s.account) ?? {};
    }

    this.log.push(log);
    return log;
  }

  /** Coins plus the base input value of unsold stock (RULES.md section 8). */
  static score(s: SellerState): number {
    return s.coins + GOODS.reduce((sum, g) => sum + s.stock[g] * INPUT_COST[g], 0);
  }

  totalCoins(): number {
    return this.buyers.reduce((s, b) => s + b.coins, 0) + this.sellers.reduce((s, x) => s + x.coins, 0);
  }
}
