import { KeyList, PublicKey } from "@hiero-ledger/sdk";

const toPublicKey = (key: string | PublicKey): PublicKey =>
  typeof key === "string" ? PublicKey.fromString(key) : key;

/**
 * A k-of-n key over the attesters. Any `threshold` of them can satisfy it.
 */
export function attesterQuorumKey(
  attesterPublicKeys: Array<string | PublicKey>,
  threshold: number,
): KeyList {
  if (attesterPublicKeys.length === 0) {
    throw new Error("At least one attester public key is required.");
  }
  if (threshold < 1 || threshold > attesterPublicKeys.length) {
    throw new Error(
      `Invalid threshold ${threshold}: must be between 1 and the number of attesters (${attesterPublicKeys.length}).`,
    );
  }
  return new KeyList(attesterPublicKeys.map(toPublicKey), threshold);
}

/**
 * The key a settlement account must carry: `and(committer, k-of-n attesters)`.
 *
 * A `KeyList` without a threshold requires every member, so nesting the
 * attester quorum inside one alongside the committer key produces an AND. That
 * is the whole safety property: the attesters can release only what the
 * committer already committed to, and nothing else. Putting the attester keys
 * directly on the account would instead let the same quorum sign ANY
 * transaction out of it.
 */
export function settlementAccountKey(
  committerPublicKey: string | PublicKey,
  attesterPublicKeys: Array<string | PublicKey>,
  threshold: number,
): KeyList {
  return new KeyList([
    toPublicKey(committerPublicKey),
    attesterQuorumKey(attesterPublicKeys, threshold),
  ]);
}
