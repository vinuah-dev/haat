import { sha256Hex } from './sha256.ts';

/** sha256(round_id | account | units | price | salt), hex. Only this goes on chain during the commit phase. */
export function commitHash(roundId: string, account: string, units: number, price: number, salt: string): string {
  return sha256Hex(`${roundId}|${account}|${units}|${price}|${salt}`);
}
