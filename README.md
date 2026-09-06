# hak-scheduled-settlement

A [Hedera Agent Kit](https://github.com/hashgraph/hedera-agent-kit-js) plugin for
**conditional settlement**: funds held in an `and(committer, k-of-n attesters)`
account and released by a pre-signed Scheduled Transaction, with **no smart
contract and no keeper**.

```bash
npm install hak-scheduled-settlement
```

## The idea

A payout does not have to be a contract call waiting to be triggered. It can be a
Scheduled Transaction that already exists on the ledger, already carries the
committer's signature, and is missing only the attesters'. **Its trigger
condition is signature collection** — when the k-of-n quorum completes, the
network executes it. No separate payout executor is needed. Attesters still need to check the condition
and submit their signatures; this plugin does not provide event monitoring.

The safety property lives in the key shape:

```
KeyList[                        <- no threshold => every branch required (AND)
  committerKey,                 <- signs ONCE, when the obligation is created
  KeyList[a1..aN] (k)           <- k-of-n attesters, sign when the condition holds
]
```

Putting the attester keys directly on the funding account would let the same
quorum sign *any* transaction out of it — the attesters become custodians of the
balance. Nested under an AND, the committer commits up front and goes away, and
the attesters can release only what the committer already committed to.

## Verified on testnet

| scenario | schedule | result |
|---|---|---|
| committer + 1 of 2 attesters | [0.0.10368695](https://hashscan.io/testnet/schedule/0.0.10368695) | pending |
| committer + 2 of 2 attesters | [0.0.10368695](https://hashscan.io/testnet/schedule/0.0.10368695) | **executed itself** |
| 3 attesters, committer absent | [0.0.10368699](https://hashscan.io/testnet/schedule/0.0.10368699) | never executed |

Reproduce with `npm run test:integration`.

## What this adds, and what it does not

Being precise about this matters more than sounding novel.

**Hedera Agent Kit core already schedules transactions.** It has an `isScheduled`
flag that wraps core transactions in a schedule, `sign_schedule_transaction_tool`,
`schedule_delete_tool`, and `getScheduledTransactionDetails`. This plugin does
**not** add scheduling to the kit.

What it adds is the **settlement pattern** around those primitives:

| | |
|---|---|
| `settlement_quorum_key` | **new** — `KeyList` / `ThresholdKey` appear nowhere in core |
| `settlement_create_account` | **new** — core account creation takes a single `publicKey` and cannot express a nested key |
| `settlement_commit` | *guardrails* — the 62-day cap enforced in the schema, `waitForExpiry: false` made explicit |
| `settlement_inspect` | *guardrails* — adds the lapsed / awaiting-quorum distinction |

There is deliberately **no** attest tool: signing belongs to whoever owns the key.
See [docs/TOOLS.md](docs/TOOLS.md#releasing-a-settlement).

### Upstream contribution

Building this surfaced a gap in the kit itself — `create_account_tool` accepts a
single `publicKey`, so an agent cannot create *any* multi-signature account.
Filed and fixed upstream:

- Issue [hashgraph/hedera-agent-kit-js#1087](https://github.com/hashgraph/hedera-agent-kit-js/issues/1087)
- Pull request [hashgraph/hedera-agent-kit-js#1088](https://github.com/hashgraph/hedera-agent-kit-js/pull/1088) — adds `publicKeys` and `threshold` to account creation, with unit and integration tests

**That PR is open, not merged.** It covers flat m-of-n keys; the *nested* AND
shape this plugin builds stays outside core even once it lands, which is why
`settlement_create_account` exists.

## Quick start

```ts
import { HederaLangchainToolkit } from "@hashgraph/hedera-agent-kit";
import { scheduledSettlementPlugin, settlementAccountKey } from "hak-scheduled-settlement";

const toolkit = new HederaLangchainToolkit({
  client,
  configuration: { plugins: [scheduledSettlementPlugin] },
});
```

Then, in agent terms:

> *"Create a settlement account funded with 100 HBAR that the committer plus any two of these three attesters control."*
>
> *"Commit a settlement of 40 HBAR from 0.0.1234 to 0.0.5678, expiring in 30 days."*
>
> — later, from each attester's own agent —
>
> *"Sign scheduled transaction 0.0.9999."*

On the k-th signature the network executes the transfer.

## Constraints worth knowing

The key restriction assumes distinct committer and attester keys. Independent
keys alone do not establish independent operators. The committer together with
the quorum can authorize other transfers; the demonstrated restriction concerns
the attesters acting without the committer.


- **62 days maximum.** Hedera caps a scheduled transaction's lifetime at
  5,356,800 seconds. Longer obligations must be re-issued, which reintroduces
  something that has to wake up — scope the term instead.
- **Amount and beneficiary are fixed at commit time.** They are written into the
  scheduled transaction. A settlement whose size is only known later cannot use
  this pattern.
- **Funds must be present when the quorum completes.** The transfer simply fails
  on an insufficient balance, and independent settlements have no queue or
  pro-rata between them. Keep committed exposure below the balance as an
  invariant in your own code.

## Where it fits

Parametric payouts, milestone escrow, bounty release, DAO disbursement — anything
shaped like *"release these funds iff k independent parties agree the condition
holds"*, where a fixed precommitted transfer is sufficient. Event detection and timely
attestation remain the caller’s responsibility.

Built during ETHOnline 2026 and first consumed by
[aivy-parametric-pool](https://github.com/jmgomezl/aivy-parametric-pool), which
uses it to settle parametric earthquake cover.

## Documentation

- [docs/TOOLS.md](docs/TOOLS.md) — every tool, its parameters, and how it relates to core
- [docs/CONFIGURATION.md](docs/CONFIGURATION.md) — agent modes, peer dependencies, limits
- [docs/EXAMPLES.md](docs/EXAMPLES.md) — end-to-end usage

## Development

```bash
npm install
npm run typecheck
npm run lint
npm run test
npm run build
```

MIT.
