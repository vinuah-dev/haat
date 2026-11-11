import { ROLES } from '../engine/economy.ts';
import type { Role } from '../engine/economy.ts';
import { DEFAULT_CONFIG, emptyStock, Town } from '../engine/town.ts';
import type { BuyerState, SellerState, TownConfig } from '../engine/town.ts';
import { GOODS } from '../engine/types.ts';
import type { Good } from '../engine/types.ts';
import { scriptedBrains } from './strategies.ts';
import type { BuyerStrategy, SellerStrategy } from './strategies.ts';

/** The town's residents. Account names follow RULES.md section 1, without the parent suffix. */

const BUYER_ROLES: Role[] = [
  ...Array<Role>(12).fill('household'),
  ...Array<Role>(3).fill('miller'),
  ...Array<Role>(3).fill('workshop'),
  ...Array<Role>(2).fill('farmhand'),
];

const BUYER_MIX: BuyerStrategy[] = ['steady', 'bargain', 'panic', 'steady', 'bargain'];

const SELLERS: { name: string; makes: Good[]; strategy: SellerStrategy }[] = [
  // The hoarder sits on grain because droughts make grain scarce; a hoarder of a good with no event never sells.
  { name: 'Farmer', makes: ['grain'], strategy: 'hoarder' },
  { name: 'Baker', makes: ['bread'], strategy: 'adaptive' },
  { name: 'Smith', makes: ['tools'], strategy: 'undercut' },
  { name: 'Weaver', makes: ['cloth'], strategy: 'cost-plus' },
  { name: 'Trader', makes: ['bread', 'cloth'], strategy: 'undercut' },
];

function buyerNames(): Record<string, string> {
  const seen: Partial<Record<Role, number>> = {};
  return Object.fromEntries(
    BUYER_ROLES.map((role, i) => {
      seen[role] = (seen[role] ?? 0) + 1;
      return [`buyer-${i + 1}`, `${ROLES[role].label} ${seen[role]}`];
    }),
  );
}

/** Display names for every account: "Miller 2", "Baker", "Player". */
export const SELLER_NAMES: Record<string, string> = {
  ...buyerNames(),
  ...Object.fromEntries(SELLERS.map((s, i) => [`seller-${i + 1}`, s.name])),
  player: 'Player',
};

export interface TownOptions extends Partial<TownConfig> {
  /** Add the player as a sixth seller who can make every good. */
  withPlayer?: boolean;
  /** In simulation the player's stall can be run by a scripted strategy instead of a person. */
  playerStrategy?: SellerStrategy;
  buyerCoins?: number;
  sellerCoins?: number;
  playerCoins?: number;
}

export function createTown(opts: TownOptions = {}): Town {
  const cfg: TownConfig = { ...DEFAULT_CONFIG, ...opts };
  const buyers: BuyerState[] = BUYER_ROLES.map((role, i) => ({
    account: `buyer-${i + 1}`,
    role,
    strategy: BUYER_MIX[i % BUYER_MIX.length],
    coins: opts.buyerCoins ?? 60,
  }));
  const sellers: SellerState[] = SELLERS.map((s, i) => ({
    account: `seller-${i + 1}`,
    makes: s.makes,
    strategy: s.strategy,
    coins: opts.sellerCoins ?? 150,
    stock: emptyStock(),
    isPlayer: false,
    lastAsk: {},
    soldYesterday: {},
  }));
  if (opts.withPlayer) {
    sellers.push({
      account: 'player',
      makes: [...GOODS],
      strategy: opts.playerStrategy ?? 'human',
      coins: opts.playerCoins ?? 200,
      stock: emptyStock(),
      isPlayer: !opts.playerStrategy,
      lastAsk: {},
      soldYesterday: {},
    });
  }
  return new Town(cfg, buyers, sellers, scriptedBrains(sellers));
}
