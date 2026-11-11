import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Settings for NEAR testnet, read from the environment (see chain/README.md). */

export const KEYS_FILE = fileURLToPath(new URL('./.keys.json', import.meta.url));

export interface ChainConfig {
  /** Your testnet account that owns the town, e.g. haat-demo.testnet */
  parent: string;
  rpc: string;
  /** Contract that stores commits and reveals as public JSON. */
  social: string;
  /** yoctoNEAR per game coin. Default 1 coin = 0.0001 NEAR. */
  coinYocto: bigint;
  explorer: string;
}

export function chainConfig(): ChainConfig {
  const parent = process.env.HAAT_PARENT;
  if (!parent || !/^[a-z0-9._-]+\.testnet$/.test(parent)) {
    throw new Error('Set HAAT_PARENT to your testnet account, e.g. HAAT_PARENT=haat-demo.testnet');
  }
  return {
    parent,
    rpc: process.env.HAAT_RPC ?? 'https://test.rpc.fastnear.com',
    social: process.env.HAAT_SOCIAL ?? 'v1.social08.testnet',
    coinYocto: BigInt(process.env.HAAT_COIN_YOCTO ?? '100000000000000000000'),
    explorer: 'https://testnet.nearblocks.io/txns/',
  };
}

/** Agent keys written by chain/setup.ts: { "buyer-1.haat-demo.testnet": "ed25519:..." } */
export function readKeys(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(KEYS_FILE, 'utf8'));
  } catch {
    throw new Error(`No agent keys at ${KEYS_FILE}. Run: node chain/setup.ts`);
  }
}
