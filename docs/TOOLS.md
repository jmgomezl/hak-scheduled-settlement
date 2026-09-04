# Tools

Four tools. Two of them do something Hedera Agent Kit core cannot; two are thin
wrappers that add guardrails. That split is stated per tool so you can decide
which you actually need.

---

## `settlement_quorum_key`

Builds the `and(committer, k-of-n attesters)` key for a settlement account.
Pure computation — no network call.

| parameter | type | required | meaning |
|---|---|---|---|
| `committerPublicKey` | `string` | yes | key of the party that commits funds |
| `attesterPublicKeys` | `string[]` | yes | keys of the attesting agents |
| `threshold` | `number` | yes | how many attesters must sign (k) |

Returns `{ shape, key, attesterCount, threshold }`.

**vs core:** `KeyList` and `ThresholdKey` appear nowhere in the kit, so there is
no core equivalent.

---

## `settlement_create_account`

Creates an account carrying that key, ready to fund conditional settlements.

| parameter | type | required | meaning |
|---|---|---|---|
| `committerPublicKey` | `string` | yes | as above |
| `attesterPublicKeys` | `string[]` | yes | as above |
| `threshold` | `number` | yes | as above |
| `initialBalance` | `number` | no | HBAR to fund with (default `0`) |
| `accountMemo` | `string` | no | account memo |

**vs core:** `create_account_tool` accepts a single `publicKey` only. A nested
`KeyList` containing a `ThresholdKey` cannot be expressed with it — see
[hashgraph/hedera-agent-kit-js#1088](https://github.com/hashgraph/hedera-agent-kit-js/pull/1088),
which adds flat multi-signature support upstream. Even with that PR merged, the
*nested* AND shape this tool builds stays outside core.

---

## `settlement_commit`

Schedules the payout and satisfies the committer branch now.

| parameter | type | required | meaning |
|---|---|---|---|
| `fromAccountId` | `string` | yes | the settlement account |
| `toAccountId` | `string` | yes | beneficiary |
| `amount` | `number` | yes | fixed at commit time |
| `tokenId` | `string` | no | HTS token; omit for HBAR |
| `expirySeconds` | `number` | no | default 30 days, max 62 days |
| `memo` | `string` | no | schedule memo |

**vs core:** largely equivalent to `transfer_hbar` with `isScheduled: true`. What
it adds is settlement semantics: the 62-day ledger cap enforced in the schema
rather than discovered as a network error, and `waitForExpiry: false` set
explicitly so the obligation fires the moment the quorum completes.

---

## `settlement_inspect`

Reports `awaiting_quorum` / `executed` / `lapsed`, with the signature count.

| parameter | type | required |
|---|---|---|
| `scheduleId` | `string` | yes |

**vs core:** overlaps `getScheduledTransactionDetails`. It adds the lapsed/awaiting
distinction, which core leaves you to derive from the expiry timestamp yourself.

---

## Releasing a settlement

There is deliberately **no** `settlement_attest` tool. Signing with an attester's
own key belongs to the attester, not to this plugin, and passing a private key
through a tool parameter would put it in the LLM's context. Use either:

- core's `sign_schedule_transaction_tool` from an agent whose operator *is* that
  attester, or
- `AgentMode.RETURN_BYTES`, which returns the frozen `ScheduleSignTransaction`
  for an external wallet to sign.

Both keep attester keys where they belong.
