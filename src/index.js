// hak-scheduled-settlement — conditional settlement for Hedera Agent Kit agents
// with NO smart contract and NO keeper.
//
// The idea: a payout is not a contract call waiting to be triggered. It is a
// Scheduled Transaction that already exists on the ledger, already carries the
// committer's signature, and is missing only the attesters'. Its trigger
// condition IS signature collection — when the k-of-n quorum completes, the
// network executes it. Nothing polls, nothing wakes up, no keeper is paid.
//
// The safety comes from the key shape. Putting the attester keys directly on the
// funding account lets the same quorum sign ANY transaction out of it, making the
// attesters custodians of the whole balance. Instead:
//
//   KeyList[                       <- no threshold => every branch required (AND)
//     committerKey,                <- signs ONCE, when the obligation is created
//     KeyList[a1..aN] (k)          <- k-of-n attesters, sign when the condition holds
//   ]
//
// The committer commits up front and goes away; the attesters can release only
// what the committer already committed to, and nothing else.
//
// Verified on Hedera testnet 2026-09-04:
//   committer + 1 of 2 attesters -> pending        (schedule 0.0.10368695)
//   committer + 2 of 2 attesters -> self-executed  (schedule 0.0.10368695)
//   3 attesters, committer absent -> never executes (schedule 0.0.10368699)
//
// Use it for parametric payouts, milestone escrow, bounty release, DAO
// disbursement — anything where "release these funds iff k independent parties
// agree the condition holds" and you do not want a contract or a cron job.
//
// Plugin shape matches hedera-agent-kit@3.x:
//   Plugin { name, version, description, tools: (context) => Tool[] }
//   Tool   { method, name, description, parameters: ZodObject, execute(client, context, params) }
import { z } from 'zod';
import {
  KeyList, PublicKey, PrivateKey, AccountId, Hbar, Timestamp,
  ScheduleCreateTransaction, ScheduleSignTransaction, ScheduleInfoQuery,
  TransferTransaction, ScheduleId, TokenId,
} from '@hashgraph/sdk';

// Hedera caps a scheduled transaction's lifetime at 62 days (5,356,800s).
// Obligations longer than that must be re-issued, which reintroduces something
// that has to wake up — so callers should scope the term rather than renew.
export const MAX_EXPIRY_SECONDS = 5356800;

/** k-of-n over the attester public keys. */
export function attesterQuorumKey(attesterPublicKeys, threshold) {
  if (threshold < 1 || threshold > attesterPublicKeys.length) {
    throw new Error(`threshold ${threshold} out of range for ${attesterPublicKeys.length} attesters`);
  }
  return new KeyList(attesterPublicKeys.map(toPublicKey), threshold);
}

/** and(committer, k-of-n attesters) — the key a settlement account must carry. */
export function settlementAccountKey(committerPublicKey, attesterPublicKeys, threshold) {
  return new KeyList([toPublicKey(committerPublicKey), attesterQuorumKey(attesterPublicKeys, threshold)]);
}

const toPublicKey = (k) => (typeof k === 'string' ? PublicKey.fromString(k) : k);
const toPrivateKey = (k) => (typeof k === 'string' ? PrivateKey.fromStringDer(k) : k);

const ok = (data) => ({ status: 'success', ...data });
const fail = (message) => ({ status: 'error', message });

export function createScheduledSettlementPlugin() {
  return {
    name: 'scheduled-settlement',
    version: '0.1.0',
    description:
      'Create and release conditional payouts on Hedera using pre-signed Scheduled ' +
      'Transactions gated by a k-of-n attester quorum. No contract, no keeper.',

    tools: (context) => [
      {
        method: 'settlement_quorum_key',
        name: 'Build a quorum settlement key',
        description:
          'Return the and(committer, k-of-n attesters) key structure to use when creating ' +
          'the account that will fund conditional settlements. Does not touch the network.',
        parameters: z.object({
          committerPublicKey: z.string().describe('Public key of the party that commits the funds'),
          attesterPublicKeys: z.array(z.string()).min(1).describe('Public keys of the attesting agents'),
          threshold: z.number().int().min(1).describe('How many attesters must sign (k)'),
        }),
        execute: async (_client, _ctx, p) => {
          try {
            const key = settlementAccountKey(p.committerPublicKey, p.attesterPublicKeys, p.threshold);
            return ok({
              key: key.toString(),
              shape: `and(committer, ${p.threshold}-of-${p.attesterPublicKeys.length} attesters)`,
              note: 'Attesters alone can never spend from an account with this key.',
            });
          } catch (e) { return fail(e.message); }
        },
      },

      {
        method: 'settlement_create',
        name: 'Create a conditional settlement',
        description:
          'Schedule a payout from the settlement account to a recipient and pre-sign it as the ' +
          'committer. It sits on the ledger doing nothing until the attester quorum signs, then ' +
          'executes itself. Amount and recipient are fixed at creation.',
        parameters: z.object({
          fromAccountId: z.string().describe('Settlement account holding the funds'),
          toAccountId: z.string().describe('Who gets paid when the condition holds'),
          amount: z.number().positive().describe('Amount to pay out'),
          tokenId: z.string().optional().describe('HTS token id; omit for HBAR'),
          expirySeconds: z.number().int().positive().max(MAX_EXPIRY_SECONDS).default(2592000)
            .describe(`Seconds until the obligation lapses (max ${MAX_EXPIRY_SECONDS} = 62 days)`),
          memo: z.string().max(100).optional(),
        }),
        execute: async (client, _ctx, p) => {
          try {
            const from = AccountId.fromString(p.fromAccountId);
            const to = AccountId.fromString(p.toAccountId);

            const inner = new TransferTransaction();
            if (p.tokenId) {
              const t = TokenId.fromString(p.tokenId);
              inner.addTokenTransfer(t, from, -p.amount).addTokenTransfer(t, to, p.amount);
            } else {
              inner.addHbarTransfer(from, new Hbar(-p.amount)).addHbarTransfer(to, new Hbar(p.amount));
            }

            const res = await new ScheduleCreateTransaction()
              .setScheduledTransaction(inner)
              .setScheduleMemo(p.memo ?? 'conditional settlement')
              .setExpirationTime(Timestamp.fromDate(new Date(Date.now() + p.expirySeconds * 1000)))
              // false => execute the instant signatures suffice, not at expiry
              .setWaitForExpiry(false)
              .execute(client);

            const receipt = await res.getReceipt(client);
            return ok({
              scheduleId: receipt.scheduleId.toString(),
              transactionId: res.transactionId.toString(),
              expiresAt: new Date(Date.now() + p.expirySeconds * 1000).toISOString(),
              note: 'Committer branch satisfied. Awaiting the attester quorum.',
            });
          } catch (e) { return fail(e.message); }
        },
      },

      {
        method: 'settlement_attest',
        name: 'Attest and sign a settlement',
        description:
          'Sign a pending settlement as one attesting agent, having independently verified the ' +
          'condition. When the k-th signature lands the network executes the payout with no ' +
          'further action from anyone.',
        parameters: z.object({
          scheduleId: z.string(),
          attesterPrivateKey: z.string().optional()
            .describe('Attester key; omit to sign with the client operator'),
        }),
        execute: async (client, ctx, p) => {
          try {
            const id = ScheduleId.fromString(p.scheduleId);
            let tx = await new ScheduleSignTransaction().setScheduleId(id).freezeWith(client);
            const key = p.attesterPrivateKey ?? ctx?.attesterPrivateKey;
            if (key) tx = await tx.sign(toPrivateKey(key));

            const res = await tx.execute(client);
            await res.getReceipt(client);

            const info = await new ScheduleInfoQuery().setScheduleId(id).execute(client);
            const executed = info.executed !== null;
            return ok({
              scheduleId: p.scheduleId,
              transactionId: res.transactionId.toString(),
              executed,
              executedAt: executed ? info.executed.toDate().toISOString() : null,
              note: executed
                ? 'Quorum met — the network executed the payout itself.'
                : 'Signature recorded. Quorum not yet met.',
            });
          } catch (e) { return fail(e.message); }
        },
      },

      {
        method: 'settlement_status',
        name: 'Read settlement status',
        description: 'Whether a conditional settlement is still pending, already executed, or lapsed.',
        parameters: z.object({ scheduleId: z.string() }),
        execute: async (client, _ctx, p) => {
          try {
            const info = await new ScheduleInfoQuery()
              .setScheduleId(ScheduleId.fromString(p.scheduleId)).execute(client);
            const executed = info.executed !== null;
            return ok({
              scheduleId: p.scheduleId,
              executed,
              executedAt: executed ? info.executed.toDate().toISOString() : null,
              expiresAt: info.expirationTime ? info.expirationTime.toDate().toISOString() : null,
              memo: info.scheduleMemo,
            });
          } catch (e) { return fail(e.message); }
        },
      },
    ],
  };
}

export default createScheduledSettlementPlugin;
