import { GOODS, INPUT_COST } from './types.ts';
import type { Good } from './types.ts';

// ---------- seeded randomness (so a simulation replays exactly from its seed) ----------

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function pickWeighted<T>(rng: Rng, items: readonly { value: T; weight: number }[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rng() * total;
  for (const i of items) {
    r -= i.weight;
    if (r < 0) return i.value;
  }
  return items[items.length - 1].value;
}

export function saltFrom(rng: Rng): string {
  let s = '';
  for (let k = 0; k < 4; k++) s += Math.floor(rng() * 0x100000000).toString(16).padStart(8, '0');
  return s;
}

// ---------- events (RULES.md section 7) ----------

export type EventName = 'drought' | 'festival' | 'new-road';

export interface EventDef {
  name: EventName;
  label: string;
  days: number;
  scarce: Good;
  costMult?: Partial<Record<Good, number>>;
  demandMult?: Partial<Record<Good, number>>;
}

export const EVENTS: Record<EventName, EventDef> = {
  drought: { name: 'drought', label: 'Drought: grain costs twice as much to grow', days: 2, scarce: 'grain', costMult: { grain: 2 } },
  festival: { name: 'festival', label: 'Festival: everyone wants bread', days: 1, scarce: 'bread', demandMult: { bread: 2 } },
  'new-road': { name: 'new-road', label: 'New road: tools are in demand', days: 3, scarce: 'tools', demandMult: { tools: 1.5 } },
};

/** Chance that a day starts a new event. */
export const EVENT_CHANCE = 0.35;

export interface ActiveEvent {
  name: EventName;
  daysLeft: number;
}

export interface Conditions {
  day: number;
  events: ActiveEvent[];
  /** Input cost per unit today. */
  cost: Record<Good, number>;
  demandMult: Record<Good, number>;
  scarce: Good[];
}

export function conditionsFor(day: number, events: ActiveEvent[]): Conditions {
  const cost = { ...INPUT_COST };
  const demandMult = Object.fromEntries(GOODS.map((g) => [g, 1])) as Record<Good, number>;
  const scarce: Good[] = [];
  for (const e of events) {
    const def = EVENTS[e.name];
    for (const [g, m] of Object.entries(def.costMult ?? {}) as [Good, number][]) cost[g] *= m;
    for (const [g, m] of Object.entries(def.demandMult ?? {}) as [Good, number][]) demandMult[g] *= m;
    if (!scarce.includes(def.scarce)) scarce.push(def.scarce);
  }
  return { day, events: events.map((e) => ({ ...e })), cost, demandMult, scarce };
}

// ---------- buyer roles and daily needs ----------

export type Role = 'household' | 'miller' | 'workshop' | 'farmhand';

export interface RoleDef {
  label: string;
  /** Chance of needing anything today. */
  needChance: number;
  wants: { value: Good; weight: number }[];
  units: [number, number];
  /** Max price = input cost x a value drawn from this range. */
  valuation: [number, number];
}

export const ROLES: Record<Role, RoleDef> = {
  household: { label: 'Household', needChance: 0.8, wants: [{ value: 'bread', weight: 3 }, { value: 'cloth', weight: 1 }], units: [1, 4], valuation: [1.4, 2.4] },
  miller: { label: 'Miller', needChance: 0.9, wants: [{ value: 'grain', weight: 1 }], units: [3, 8], valuation: [1.5, 2.5] },
  workshop: { label: 'Workshop', needChance: 0.7, wants: [{ value: 'tools', weight: 1 }, { value: 'cloth', weight: 1 }], units: [1, 3], valuation: [1.3, 2.0] },
  farmhand: { label: 'Farmhand', needChance: 0.6, wants: [{ value: 'tools', weight: 1 }], units: [1, 2], valuation: [1.3, 2.0] },
};

export interface Need {
  account: string;
  good: Good;
  units: number;
  /** Private: the most this buyer would pay per unit. */
  maxPrice: number;
}

export function drawNeed(rng: Rng, account: string, role: Role, cond: Conditions): Need | null {
  const def = ROLES[role];
  if (rng() >= def.needChance) return null;
  const good = pickWeighted(rng, def.wants);
  const units = Math.max(1, Math.round(randInt(rng, def.units[0], def.units[1]) * cond.demandMult[good]));
  const [lo, hi] = def.valuation;
  const valuation = lo + rng() * (hi - lo);
  // Buyers expect to pay more when an event raises the cost to make the good, but not all of it.
  const costBump = 1 + 0.5 * (cond.cost[good] / INPUT_COST[good] - 1);
  const maxPrice = Math.max(1, Math.round(INPUT_COST[good] * valuation * costBump));
  return { account, good, units, maxPrice };
}

// ---------- swarms ----------

export interface Swarm {
  good: Good;
  members: string[];
  totalDemand: number;
}

/** Buyers who need the same good form one swarm for it (RULES.md section 3). */
export function formSwarms(needs: Need[]): Swarm[] {
  const swarms: Swarm[] = [];
  for (const good of GOODS) {
    const mine = needs.filter((n) => n.good === good);
    if (mine.length === 0) continue;
    swarms.push({ good, members: mine.map((n) => n.account), totalDemand: mine.reduce((s, n) => s + n.units, 0) });
  }
  return swarms;
}
