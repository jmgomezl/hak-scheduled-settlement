import { KeyList, PrivateKey, ScheduleCreateTransaction } from "@hiero-ledger/sdk";
import { describe, expect, it } from "vitest";
import { scheduledSettlementPlugin, scheduledSettlementToolNames } from "../src/index";
import { commitSettlementTool } from "../src/tools/commit";
import { createSettlementAccountTool } from "../src/tools/create-account";
import { quorumKeyTool } from "../src/tools/quorum-key";
import { MAX_EXPIRY_SECONDS } from "../src/types";

const ctx = {} as never;
const client = {} as never;
const pub = () => PrivateKey.generateED25519().publicKey.toStringDer();

describe("plugin surface", () => {
  it("exposes exactly the four documented tools", () => {
    const methods = scheduledSettlementPlugin.tools(ctx).map((tool) => tool.method);
    expect(methods).toEqual(Object.values(scheduledSettlementToolNames));
  });
});

describe("settlement_quorum_key", () => {
  it("returns a nested AND key and a readable shape", async () => {
    const result = await quorumKeyTool.coreAction(
      { committerPublicKey: pub(), attesterPublicKeys: [pub(), pub(), pub()], threshold: 2 },
      ctx,
      client,
    );

    expect(result.shape).toBe("and(committer, 2-of-3 attesters)");
    expect(result.attesterCount).toBe(3);
    expect(result.threshold).toBe(2);
    expect(result.key).toContain("threshold");
  });

  it("rejects a threshold above the attester count via the schema", () => {
    const parsed = quorumKeyTool.parameters.safeParse({
      committerPublicKey: pub(),
      attesterPublicKeys: [pub()],
      threshold: 0,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("settlement_create_account", () => {
  it("builds an account transaction keyed and(committer, k-of-n)", async () => {
    const { transaction } = await createSettlementAccountTool.coreAction(
      {
        committerPublicKey: pub(),
        attesterPublicKeys: [pub(), pub(), pub()],
        threshold: 2,
        initialBalance: 0,
      },
      ctx,
      client,
    );

    const key = transaction.key as KeyList;
    expect(key).toBeInstanceOf(KeyList);
    expect(key.threshold).toBeNull();
    expect((Array.from(key)[1] as KeyList).threshold).toBe(2);
    expect(transaction.receiverSignatureRequired).toBe(false);
  });
});

describe("settlement_commit", () => {
  it("schedules a transfer that executes as soon as signatures suffice", async () => {
    const { transaction } = await commitSettlementTool.coreAction(
      { fromAccountId: "0.0.1001", toAccountId: "0.0.1002", amount: 5, expirySeconds: 3600 },
      ctx,
      client,
    );

    expect(transaction).toBeInstanceOf(ScheduleCreateTransaction);
    // false is what makes the settlement self-executing: it fires the moment the
    // quorum completes rather than waiting for the expiry timestamp.
    expect(transaction.waitForExpiry).toBe(false);
  });

  it("refuses an expiry beyond the 62-day ledger cap", () => {
    const parsed = commitSettlementTool.parameters.safeParse({
      fromAccountId: "0.0.1001",
      toAccountId: "0.0.1002",
      amount: 5,
      expirySeconds: MAX_EXPIRY_SECONDS + 1,
    });
    expect(parsed.success).toBe(false);
  });

  it("defaults to a 30-day obligation", () => {
    const parsed = commitSettlementTool.parameters.parse({
      fromAccountId: "0.0.1001",
      toAccountId: "0.0.1002",
      amount: 5,
    });
    expect(parsed.expirySeconds).toBe(2_592_000);
  });
});
