// Creates one testnet sub-account per agent under your account, each with its own new key.
//
//   HAAT_PARENT=haat-demo.testnet HAAT_PARENT_KEY=ed25519:... node chain/setup.ts [--fund 0.12] [--dry-run]
//
// Keys are written to chain/.keys.json (git-ignored). Accounts that already exist are skipped.
// Funding: 26 agents x --fund NEAR, plus a little gas. The default needs about 3.2 testnet NEAR.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { Account, JsonRpcProvider, KeyPair, nearToYocto } from 'near-api-js';
import { createTown } from '../agents/roster.ts';
import { chainConfig, KEYS_FILE } from './config.ts';

const { values } = parseArgs({ options: { fund: { type: 'string', default: '0.12' }, 'dry-run': { type: 'boolean', default: false } } });
const cfg = chainConfig();
const parentKey = process.env.HAAT_PARENT_KEY;
if (!values['dry-run'] && !parentKey?.startsWith('ed25519:')) throw new Error('Set HAAT_PARENT_KEY to the private key of HAAT_PARENT (ed25519:...)');

const town = createTown({ withPlayer: true });
const names = [...town.buyers.map((b) => b.account), ...town.sellers.map((s) => s.account)];
const keys: Record<string, string> = existsSync(KEYS_FILE) ? JSON.parse(readFileSync(KEYS_FILE, 'utf8')) : {};

const provider = new JsonRpcProvider({ url: cfg.rpc });
const parent = new Account(cfg.parent, provider, parentKey as `ed25519:${string}`);

console.log(`${values['dry-run'] ? '[dry run] ' : ''}Creating ${names.length} agent accounts under ${cfg.parent}, ${values.fund} NEAR each`);

for (const name of names) {
  const id = `${name}.${cfg.parent}`;
  let exists = false;
  try {
    await provider.viewAccount({ accountId: id });
    exists = true;
  } catch {}
  if (exists) {
    console.log(`  ${id} exists${keys[id] ? '' : ' (but no key here: delete it or remove it from the town)'}`);
    continue;
  }
  if (values['dry-run']) {
    console.log(`  would create ${id}`);
    continue;
  }
  const kp = KeyPair.fromRandom('ed25519');
  await parent.createSubAccount({ accountOrPrefix: id, publicKey: kp.getPublicKey(), nearToTransfer: nearToYocto(values.fund!) });
  keys[id] = kp.toString();
  writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2)); // save after every account so a failure loses nothing
  console.log(`  created ${id}`);
}

console.log(`Done. Keys in ${KEYS_FILE}. Start the game on testnet with:\n  HAAT_CHAIN=testnet HAAT_PARENT=${cfg.parent} node server/index.ts`);
