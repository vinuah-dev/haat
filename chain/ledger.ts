import type { DayLog } from '../engine/town.ts';

/**
 * Where a finished day is mirrored. The engine decides the market; a ledger
 * writes what happened on chain, in order: every commit, then every reveal,
 * then the trade payments.
 */

export interface TxRef {
  /** Transaction hash, or a local id when nothing went on chain. */
  hash: string;
  /** Explorer link, absent for local ids. */
  url?: string;
}

export interface RoundTxs {
  commits: Record<string, TxRef>;
  reveals: Record<string, TxRef>;
  payments: { from: string; to: string; amount: number; tx: TxRef }[];
}

export interface DayTxs {
  network: 'local' | 'testnet';
  rounds: Record<string, RoundTxs>;
  errors: string[];
}

export interface Ledger {
  readonly network: 'local' | 'testnet';
  /** Full account id for an engine account name, e.g. buyer-3 -> buyer-3.haat.testnet */
  accountId(name: string): string;
  recordDay(log: DayLog): Promise<DayTxs>;
}

/** Nothing leaves the machine. Used for the offline game, tests and the simulation. */
export class LocalLedger implements Ledger {
  readonly network = 'local' as const;
  private counter = 0;

  accountId(name: string): string {
    return `${name}.haat.local`;
  }

  async recordDay(log: DayLog): Promise<DayTxs> {
    const id = () => ({ hash: `local-${(++this.counter).toString(36).padStart(5, '0')}` });
    const rounds: Record<string, RoundTxs> = {};
    for (const r of log.rounds) {
      const tx: RoundTxs = { commits: {}, reveals: {}, payments: [] };
      for (const c of r.commits) tx.commits[c.account] = id();
      for (const v of r.reveals) tx.reveals[v.account] = id();
      for (const p of log.payments.filter((p) => p.round === r.spec.id)) tx.payments.push({ from: p.from, to: p.to, amount: p.amount, tx: id() });
      rounds[r.spec.id] = tx;
    }
    return { network: 'local', rounds, errors: [] };
  }
}
