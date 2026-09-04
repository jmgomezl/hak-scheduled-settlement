# hak-scheduled-settlement

Conditional settlement for [Hedera Agent Kit](https://github.com/hashgraph/hedera-agent-kit)
agents **with no smart contract and no keeper**.

A payout is not a contract call waiting to be triggered. It is a Scheduled
Transaction that already exists on the ledger, already carries the committer's
signature, and is missing only the attesters'. **Its trigger condition is
signature collection** — when the k-of-n quorum completes, the network executes
it. Nothing polls, nothing wakes up, no keeper is paid.

## The key shape is the whole idea

Putting attester keys directly on the funding account lets the same quorum sign
*any* transaction out of it — the attesters become custodians of the balance.
Instead:

```
KeyList[                        <- no threshold => every branch required (AND)
  committerKey,                 <- signs ONCE, when the obligation is created
  KeyList[a1..aN] (k)           <- k-of-n attesters, sign when the condition holds
]
```

The committer commits up front and goes away. The attesters can release only what
the committer already committed to, and nothing else.

## Verified on testnet

| scenario | schedule | result |
|---|---|---|
| committer + 1 of 2 attesters | [0.0.10368695](https://hashscan.io/testnet/schedule/0.0.10368695) | pending |
| committer + 2 of 2 attesters | [0.0.10368695](https://hashscan.io/testnet/schedule/0.0.10368695) | **executed itself** |
| 3 attesters, committer absent | [0.0.10368699](https://hashscan.io/testnet/schedule/0.0.10368699) | never executed |

## Install

```bash
npm install hak-scheduled-settlement
```

## Tools

| method | what it does |
|---|---|
| `settlement_quorum_key` | build the `and(committer, k-of-n)` key for the settlement account |
| `settlement_create` | schedule a payout and pre-sign it as committer |
| `settlement_attest` | sign as one attester; the k-th signature executes the payout |
| `settlement_status` | pending / executed / lapsed |

## Usage

```js
import { createScheduledSettlementPlugin, settlementAccountKey } from 'hak-scheduled-settlement';

// 1. Key the funding account so attesters can never spend on their own.
const key = settlementAccountKey(committerPubKey, [o1, o2, o3], 2);
await new AccountCreateTransaction().setKeyWithoutAlias(key).execute(client);

// 2. Register the plugin with your agent.
const agent = new HederaAgentKit({ client, plugins: [createScheduledSettlementPlugin()] });
```

Then, in agent terms:

> *"Create a conditional settlement of 800 HBAR from 0.0.x to 0.0.y, expiring in 30 days."*
> → `scheduleId`, committer branch satisfied, awaiting quorum.
>
> *"I verified the condition. Attest settlement 0.0.z."*
> → signature recorded; on the k-th one, `executed: true` and the funds have moved.

## Constraints worth knowing

- **62 days maximum.** Hedera caps a scheduled transaction's lifetime at
  5,356,800 seconds. Obligations longer than that must be re-issued — which
  reintroduces something that has to wake up, so scope the term instead.
- **The amount and recipient are fixed at creation.** They are written into the
  scheduled transaction. Any settlement whose size is only known later cannot use
  this pattern.
- **`waitForExpiry` is false**, so a settlement fires the instant the quorum is
  met rather than at expiry.
- **Funds must be there when the quorum completes.** The scheduled transfer will
  simply fail on an insufficient balance; there is no queueing or pro-rata. Keep
  committed exposure below the account balance as an invariant.

## Where it fits

Parametric payouts, milestone escrow, bounty release, DAO disbursement — anything
shaped like *"release these funds iff k independent parties agree the condition
holds"*, where you would rather not deploy a contract or run a cron job.

Built during ETHOnline 2026 and extracted from
[aivy-parametric-pool](https://github.com/jmgomezl/aivy-parametric-pool), which
uses it to settle parametric earthquake cover.

MIT.
