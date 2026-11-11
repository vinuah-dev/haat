# Running Haat on NEAR testnet

By default the game uses an offline ledger. In testnet mode, every finished day
is written to NEAR testnet by the agents themselves:

| Wave | Who signs | What goes on chain |
|---|---|---|
| 1. Commit | each agent's own sub-account | `set` on the social contract: `haat/<round>/commit` = the sealed sha256 hash |
| 2. Reveal | each agent's own sub-account | `haat/<round>/reveal` = units, price and salt, so anyone can recompute the hash |
| 3. Settle | each winning buyer | a NEAR transfer to each seller it bought from, `units × price` coins |

Every reveal transaction is sent only after every commit of that day has landed.

## What is and is not on chain

- The engine on the server runs the market and decides the clearing price. The
  chain is the public, signed record: anyone can check each commit against its
  reveal and re-run the clearing from the reveals (RULES.md section 4).
- Wages, production costs and bonds stay in the game's own ledger. Agents are
  funded once at setup and pay trades out of that float.
- Settlement uses plain transfers. NEAR Intents settlement is not built yet.

## Setup

1. Create a testnet account in any NEAR wallet and fund it from the testnet
   faucet. About 3.5 NEAR covers 26 agents at the default 0.12 NEAR each.
2. Export its private key (`ed25519:...`). It is only used by the setup script.
3. Create the agent accounts:

   ```bash
   HAAT_PARENT=yourname.testnet HAAT_PARENT_KEY=ed25519:... node chain/setup.ts
   ```

   Add `--dry-run` first to see what it will create. Agent keys are saved to
   `chain/.keys.json`, which git ignores. Never commit it.
4. Run the game against testnet:

   ```bash
   HAAT_CHAIN=testnet HAAT_PARENT=yourname.testnet node server/index.ts
   ```

Every hash in the market view then links to NearBlocks.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `HAAT_PARENT` | (required) | the account that owns the agents |
| `HAAT_RPC` | `https://test.rpc.fastnear.com` | testnet RPC |
| `HAAT_SOCIAL` | `v1.social08.testnet` | contract that stores commits and reveals |
| `HAAT_COIN_YOCTO` | `100000000000000000000` | yoctoNEAR per coin (1 coin = 0.0001 NEAR) |

## Status

The setup script and the ledger have only been tried against the testnet RPC
with read calls and a dry run. No agent account has been created and no
transaction has been sent yet.
