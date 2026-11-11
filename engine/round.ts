import { clearMarket } from './clear.ts';
import { commitHash } from './commit.ts';
import type { Clearing, Good, Order, Side } from './types.ts';

export interface RoundSpec {
  id: string;
  good: Good;
  buyers: string[];
  sellers: string[];
  /** Sum of the swarm's needed units, published when the round opens. */
  totalDemand: number;
  bond: number;
  /** Units each seller holds; an ask above this is an invalid reveal. */
  sellerStock: Record<string, number>;
}

export interface CommitRecord {
  account: string;
  side: Side;
  hash: string;
  seq: number;
}

export interface RevealRecord {
  account: string;
  side: Side;
  units: number;
  price: number;
  /** Published with the reveal so anyone can recompute the commit hash. */
  salt: string;
  valid: boolean;
  reason?: string;
}

export interface BondOutcome {
  /** Committed and revealed correctly: bond returned. */
  refunded: string[];
  /** Committed but did not reveal, or revealed wrongly: bond lost. */
  forfeited: string[];
  /** Forfeited bonds, split evenly among buyers who revealed correctly. */
  payouts: Record<string, number>;
  /** Forfeited coins with no buyer to receive them; they go to the town. */
  unallocated: number;
}

export interface RoundResult {
  spec: RoundSpec;
  commits: CommitRecord[];
  reveals: RevealRecord[];
  clearing: Clearing;
  bonds: BondOutcome;
}

export type Phase = 'commit' | 'reveal' | 'cleared';

/** One sealed-bid round for one good (RULES.md section 4). Pure state machine, no I/O. */
export class Round {
  readonly spec: RoundSpec;
  phase: Phase = 'commit';
  private commits = new Map<string, CommitRecord>();
  private reveals = new Map<string, RevealRecord>();
  private nextSeq = 0;

  constructor(spec: RoundSpec) {
    this.spec = spec;
  }

  commit(account: string, side: Side, hash: string): CommitRecord {
    if (this.phase !== 'commit') throw new Error(`round ${this.spec.id}: commit phase is over`);
    const allowed = side === 'buy' ? this.spec.buyers : this.spec.sellers;
    if (!allowed.includes(account)) throw new Error(`round ${this.spec.id}: ${account} cannot ${side} here`);
    if (this.commits.has(account)) throw new Error(`round ${this.spec.id}: ${account} already committed`);
    if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error(`round ${this.spec.id}: commit is not a sha256 hex hash`);
    const rec: CommitRecord = { account, side, hash, seq: this.nextSeq++ };
    this.commits.set(account, rec);
    return rec;
  }

  closeCommits(): void {
    if (this.phase !== 'commit') throw new Error(`round ${this.spec.id}: not in commit phase`);
    this.phase = 'reveal';
  }

  /** One reveal per commit. A wrong reveal is recorded as invalid and its bond is forfeited at clearing. */
  reveal(account: string, units: number, price: number, salt: string): RevealRecord {
    if (this.phase !== 'reveal') throw new Error(`round ${this.spec.id}: not in reveal phase`);
    const c = this.commits.get(account);
    if (!c) throw new Error(`round ${this.spec.id}: ${account} has no commit`);
    if (this.reveals.has(account)) throw new Error(`round ${this.spec.id}: ${account} already revealed`);

    let reason: string | undefined;
    if (commitHash(this.spec.id, account, units, price, salt) !== c.hash) reason = 'does not match commit';
    else if (!Number.isInteger(units) || units < 0 || !Number.isInteger(price) || price < 0) reason = 'units and price must be whole numbers';
    else if (c.side === 'sell' && units > (this.spec.sellerStock[account] ?? 0)) reason = 'asks more units than in stock';

    const rec: RevealRecord = { account, side: c.side, units, price, salt, valid: reason === undefined };
    if (reason) rec.reason = reason;
    this.reveals.set(account, rec);
    return rec;
  }

  clear(): RoundResult {
    if (this.phase !== 'reveal') throw new Error(`round ${this.spec.id}: not in reveal phase`);
    this.phase = 'cleared';

    const orders: Order[] = [];
    for (const r of this.reveals.values()) {
      if (r.valid) orders.push({ account: r.account, side: r.side, units: r.units, price: r.price, seq: this.commits.get(r.account)!.seq });
    }
    const clearing = clearMarket(orders);

    const refunded: string[] = [];
    const forfeited: string[] = [];
    for (const c of this.commits.values()) (this.reveals.get(c.account)?.valid ? refunded : forfeited).push(c.account);

    const pot = forfeited.length * this.spec.bond;
    const recipients = refunded.filter((a) => this.commits.get(a)!.side === 'buy').sort();
    const payouts: Record<string, number> = {};
    let unallocated = pot;
    if (pot > 0 && recipients.length > 0) {
      const share = Math.floor(pot / recipients.length);
      let rest = pot - share * recipients.length;
      for (const a of recipients) {
        payouts[a] = share + (rest > 0 ? 1 : 0);
        if (rest > 0) rest--;
      }
      unallocated = 0;
    }

    return {
      spec: this.spec,
      commits: [...this.commits.values()],
      reveals: [...this.reveals.values()],
      clearing,
      bonds: { refunded, forfeited, payouts, unallocated },
    };
  }
}
