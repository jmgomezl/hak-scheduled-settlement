import { KeyList, PrivateKey } from "@hiero-ledger/sdk";
import { describe, expect, it } from "vitest";
import { attesterQuorumKey, settlementAccountKey } from "../src/keys";

const publicKey = () => PrivateKey.generateED25519().publicKey;

describe("attesterQuorumKey", () => {
  it("builds a k-of-n key over the attesters", () => {
    const key = attesterQuorumKey([publicKey(), publicKey(), publicKey()], 2);

    expect(key).toBeInstanceOf(KeyList);
    expect(key.threshold).toBe(2);
    expect(Array.from(key).length).toBe(3);
  });

  it("accepts serialized public keys", () => {
    const keys = [publicKey(), publicKey()].map((k) => k.toStringDer());
    const key = attesterQuorumKey(keys, 1);

    expect(key.threshold).toBe(1);
    expect(Array.from(key).length).toBe(2);
  });

  it("rejects an empty attester set", () => {
    expect(() => attesterQuorumKey([], 1)).toThrow(/At least one attester/);
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["greater than the attester count", 4],
  ])("rejects a threshold that is %s", (_label, threshold) => {
    expect(() => attesterQuorumKey([publicKey(), publicKey(), publicKey()], threshold)).toThrow(
      /Invalid threshold/,
    );
  });
});

describe("settlementAccountKey", () => {
  it("nests the quorum inside an AND with the committer", () => {
    const committer = publicKey();
    const key = settlementAccountKey(committer, [publicKey(), publicKey(), publicKey()], 2);

    expect(key).toBeInstanceOf(KeyList);
    // No threshold on the outer list means every branch is required.
    expect(key.threshold).toBeNull();

    const branches = Array.from(key);
    expect(branches.length).toBe(2);

    // Second branch is the attester quorum, and it is a threshold key.
    const quorum = branches[1] as KeyList;
    expect(quorum).toBeInstanceOf(KeyList);
    expect(quorum.threshold).toBe(2);
    expect(Array.from(quorum).length).toBe(3);
  });

  it("propagates threshold validation from the quorum", () => {
    expect(() => settlementAccountKey(publicKey(), [publicKey()], 2)).toThrow(/Invalid threshold/);
  });
});
