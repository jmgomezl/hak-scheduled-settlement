# Examples

## Register the plugin

```ts
import { HederaLangchainToolkit } from "@hashgraph/hedera-agent-kit";
import { scheduledSettlementPlugin } from "hak-scheduled-settlement";

const toolkit = new HederaLangchainToolkit({
  client,
  configuration: { plugins: [scheduledSettlementPlugin] },
});
```

## Set up a settlement account

Three attesters, any two of which can release a payment.

```ts
import { settlementAccountKey } from "hak-scheduled-settlement";
import { AccountCreateTransaction } from "@hiero-ledger/sdk";

const key = settlementAccountKey(committerPublicKey, [a1, a2, a3], 2);

await new AccountCreateTransaction()
  .setKeyWithoutAlias(key)
  .setInitialBalance(new Hbar(100))
  .execute(client);
```

Or let the agent do it:

> *"Create a settlement account funded with 100 HBAR that the committer plus any
> two of these three attesters control."*

## Commit an obligation

> *"Commit a settlement of 40 HBAR from 0.0.1234 to 0.0.5678, expiring in 30 days."*

Returns a `scheduleId`. The committer branch is now satisfied; nothing else runs.

## Release it

Each attester signs independently, with its own key, from its own agent:

> *"Sign scheduled transaction 0.0.9999."*  (core `sign_schedule_transaction_tool`)

When the k-th signature lands the network executes the transfer. No keeper woke
up, and no single attester could have moved those funds alone.

## Check state

> *"What is the state of settlement 0.0.9999?"*

```json
{
  "scheduleId": "0.0.9999",
  "state": "executed",
  "executedAt": "2026-09-04T21:22:30.353Z",
  "signatureCount": 3
}
```

## Shapes this fits

- **Parametric payouts** — oracle agents attest that a threshold was crossed.
- **Milestone escrow** — reviewers attest that work was delivered.
- **Bounty release** — maintainers attest that a fix landed.
- **DAO disbursement** — signers attest to an approved spend.

The common shape is *"release these funds iff k independent parties agree the
condition holds"*, where you would rather not deploy a contract or run a cron job.
