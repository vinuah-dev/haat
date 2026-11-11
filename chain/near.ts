import { Account, JsonRpcProvider, nearToYocto } from 'near-api-js';
import type { DayLog } from '../engine/town.ts';
import { chainConfig, readKeys } from './config.ts';
import type { ChainConfig } from './config.ts';
import type { DayTxs, Ledger, RoundTxs, TxRef } from './ledger.ts';

/**
 * Mirrors each finished day to NEAR testnet, in three waves:
 *   1. every agent writes its sealed commit hashes to the social contract, signed by its own sub-account
 *   2. every agent writes its reveal (units, price, salt) the same way, so anyone can recompute the hash
 *   3. every winning buyer pays each seller it bought from, a plain NEAR transfer
 * Within a wave, accounts send in parallel; each account sends its own transactions one at a time.
 */
export class NearLedger implements Ledger {
  readonly network = 'testnet' as const;
  private cfg: ChainConfig;
  private accounts = new Map<string, Account>();

  constructor(cfg: ChainConfig, keys: Record<string, string>) {
    this.cfg = cfg;
    const provider = new JsonRpcProvider({ url: cfg.rpc });
    for (const [id, key] of Object.entries(keys)) {
      this.accounts.set(id, new Account(id, provider, key as `ed25519:${string}`));
    }
  }

  static fromEnv(): NearLedger {
    return new NearLedger(chainConfig(), readKeys());
  }

  accountId(name: string): string {
    return `${name}.${this.cfg.parent}`;
  }

  private account(name: string): Account {
    const a = this.accounts.get(this.accountId(name));
    if (!a) throw new Error(`no key for ${this.accountId(name)}; run node chain/setup.ts`);
    return a;
  }

  private ref(res: unknown): TxRef {
    const r = res as { transaction_outcome?: { id?: string }; transaction?: { hash?: string } };
    const hash = r.transaction_outcome?.id ?? r.transaction?.hash ?? 'unknown';
    return { hash, url: this.cfg.explorer + hash };
  }

  /** One social-contract write from `name` holding all of its entries for this wave. */
  private async writeSocial(name: string, entries: Record<string, unknown>): Promise<TxRef> {
    const id = this.accountId(name);
    const res = await this.account(name).callFunctionRaw({
      contractId: this.cfg.social,
      methodName: 'set',
      args: { data: { [id]: { haat: entries } } },
      // Covers storage for the new keys; anything unused stays as this account's storage balance.
      deposit: nearToYocto('0.003'),
    });
    return this.ref(res);
  }

  async recordDay(log: DayLog): Promise<DayTxs> {
    const errors: string[] = [];
    const rounds: Record<string, RoundTxs> = {};
    for (const r of log.rounds) rounds[r.spec.id] = { commits: {}, reveals: {}, payments: [] };

    const wave = async <T>(jobs: Map<string, () => Promise<T>>): Promise<Map<string, T>> => {
      const out = new Map<string, T>();
      await Promise.all(
        [...jobs].map(async ([name, job]) => {
          try {
            out.set(name, await job());
          } catch (e) {
            errors.push(`${name}: ${(e as Error).message ?? e}`.slice(0, 300));
          }
        }),
      );
      return out;
    };

    // 1. commits, grouped by account
    const commitsBy = new Map<string, Record<string, unknown>>();
    for (const r of log.rounds) {
      for (const c of r.commits) {
        const e = commitsBy.get(c.account) ?? {};
        e[r.spec.id] = { commit: c.hash, side: c.side };
        commitsBy.set(c.account, e);
      }
    }
    const commitTx = await wave(new Map([...commitsBy].map(([name, e]) => [name, () => this.writeSocial(name, e)])));
    for (const r of log.rounds) for (const c of r.commits) {
      const tx = commitTx.get(c.account);
      if (tx) rounds[r.spec.id].commits[c.account] = tx;
    }

    // 2. reveals, only after every commit has landed
    const revealsBy = new Map<string, Record<string, unknown>>();
    for (const r of log.rounds) {
      for (const v of r.reveals) {
        const e = revealsBy.get(v.account) ?? {};
        e[r.spec.id] = { reveal: { units: v.units, price: v.price, salt: v.salt }, valid: v.valid };
        revealsBy.set(v.account, e);
      }
    }
    const revealTx = await wave(new Map([...revealsBy].map(([name, e]) => [name, () => this.writeSocial(name, e)])));
    for (const r of log.rounds) for (const v of r.reveals) {
      const tx = revealTx.get(v.account);
      if (tx) rounds[r.spec.id].reveals[v.account] = tx;
    }

    // 3. payments, one transfer per buyer-seller pair, each buyer paying in turn
    const payBy = new Map<string, typeof log.payments>();
    for (const p of log.payments) payBy.set(p.from, [...(payBy.get(p.from) ?? []), p]);
    await wave(
      new Map(
        [...payBy].map(([buyer, pays]) => [
          buyer,
          async () => {
            for (const p of pays) {
              const res = await this.account(buyer).transfer({ receiverId: this.accountId(p.to), amount: BigInt(p.amount) * this.cfg.coinYocto });
              rounds[p.round].payments.push({ from: p.from, to: p.to, amount: p.amount, tx: this.ref(res) });
            }
          },
        ]),
      ),
    );

    return { network: 'testnet', rounds, errors };
  }
}
