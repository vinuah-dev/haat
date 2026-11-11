# Haat

A market town run by AI agents with their own NEAR wallets. Every morning the
townsfolk who need the same good band together into a buying swarm and run a
sealed-bid market against the sellers. You run one of the stalls and try to
out-trade agents who learn from every round.

**Tracks:** Games With Real Economies · AI Swarms · Agent Economy
**Built at:** NEAR HACKATHON, November 2026

The market rules are in [RULES.md](RULES.md). They are the spec the code follows.

## Play

Needs Node 24 or newer.

```bash
npm install
```

```bash
npm start
```

Open http://localhost:5173.

- **Tutorial (start here):** three guided days in a fixed town, in English or
  Hinglish. A spotlight shows one control at a time and waits for you to use
  it. Day 1 you make and sell bread, day 2 you ask too much and sell nothing,
  day 3 a festival doubles demand and you play on your own.
  `agents/tutorial.test.ts` checks the town still plays out the way the script
  says.
- **Run a stall:** each day choose what to make and what to sell at what lowest
  price, then seal your offers. Ten days; the best stall wins.
- **Watch the swarm:** 26 agents trade on their own, day after day. Each round
  shows the sealed hashes, the reveals, the bid and ask curves, the clearing
  price and every payment.

The market square is animated: villagers gather under their swarm's banner,
sealed cards are dealt and flipped, the clearing price is stamped, and buyers
walk to the stalls they bought from while coins fly over. Events change the
scene (drought dries the hills, a festival hangs bunting, a new road brings
carts). PC and phone get different layouts: a wide street with a side board
on PC; a two-row square, a bottom tab bar and a bottom-sheet round with
vibration on phones. Sound is synthesized in the browser and can be muted.

## How a day works

1. Buyers who need the same good form a swarm. Only total demand is public.
2. Everyone commits `sha256(round | account | units | price | salt)` with a bond.
3. Everyone reveals. A reveal that does not match its hash forfeits the bond.
4. One uniform price clears each market. Each buyer pays only its own share.
5. Payments go straight from buyer to seller. Unsold stock partly spoils.

Events (drought, festival, new road) change costs and demand, and the agents'
strategies react with no developer patching prices.

## On NEAR

In testnet mode every agent has its own sub-account (`buyer-3.yourname.testnet`).
Each agent signs its own commit and reveal to the social contract and pays
sellers with its own transfers, so every step traces back to one agent. Setup
is in [chain/README.md](chain/README.md).

## Status

| Part | State |
|---|---|
| Market engine: commit-reveal, uniform-price clearing, bonds | Done, unit tested |
| Town: events, needs, swarms, production, settlement, spoilage | Done, unit tested |
| Scripted agents and simulation mode (20 buyers, 5 sellers, no LLM) | Done |
| Game UI and live market view | Done, played end to end in a browser |
| NEAR testnet: sub-accounts, on-chain commits, reveals, payments | Written; not yet run against testnet |
| NEAR Intents settlement | Not started |
| LLM agents through NEAR AI | Not started |

## Simulation and tests

```bash
npm test
```

```bash
node sim/run.ts --seed 42 --days 10 --player adaptive
```

`--out sim/out/run.json` writes the full log of every round, commit, reveal and payment.

## Layout

```
RULES.md            market rules and the sequence of one round (the spec)
engine/             pure market logic, no I/O
  clear.ts          uniform-price call market
  round.ts          one sealed-bid round: commit, reveal, clear, bonds
  economy.ts        seeded randomness, events, buyer roles, swarms
  town.ts           a whole game day for every agent and the player
agents/             scripted strategies and the town's residents
sim/                simulation mode
server/             game server and JSON API
web/                the game and the live market view
chain/              offline ledger and NEAR testnet ledger, account setup
```

## Other project

This README will name our second, independent hackathon project once it exists.
