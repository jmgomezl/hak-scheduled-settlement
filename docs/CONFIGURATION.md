# Configuration

The plugin holds no configuration of its own. It reads nothing from the
environment and stores no state — everything it needs arrives as tool parameters
or comes from the `Client` and `Context` the agent already has.

## Peer dependencies

```json
"@hashgraph/hedera-agent-kit": "^4.0.0",
"@hiero-ledger/sdk": "^2.84.0"
```

Both are peers so the plugin shares the agent's single SDK instance rather than
bundling a second copy.

## Agent modes

The transaction tools go through the kit's `handleTransaction`, so they respect
whatever mode the agent runs in:

| mode | behaviour |
|---|---|
| `AUTONOMOUS` | the transaction is signed by the operator and submitted |
| `RETURN_BYTES` | the frozen transaction is returned for an external wallet |
| `CUSTOM_EXECUTE_TX` / `CUSTOM_RETURN_BYTES` | your strategy is used |

`RETURN_BYTES` matters here: it is how an attester signs a settlement with its
own key without that key ever entering the agent's context.

## Environment

Only `npm run test:integration` needs credentials, and only to exercise the
plugin against a live network:

```
HEDERA_NETWORK=testnet
HEDERA_ACCOUNT_ID=0.0.xxxxxxx
HEDERA_PRIVATE_KEY=0x...   # hex ECDSA secp256k1
```

Unit tests need none of it.

## Limits worth configuring around

- **62 days.** `expirySeconds` is capped at 5,356,800 by the ledger. The schema
  rejects anything larger before a transaction is built.
- **Amount and beneficiary are fixed at commit time.** They are written into the
  scheduled transaction, so a settlement whose size is only known later cannot
  use this pattern.
- **Balance is not checked.** A scheduled transfer that completes its quorum
  against an insufficient balance simply fails, and independent settlements have
  no queue or pro-rata between them. Keep committed exposure below the account
  balance as an invariant in your own code.
