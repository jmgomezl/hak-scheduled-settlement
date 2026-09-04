import { BaseTool, type Context } from "@hashgraph/hedera-agent-kit";
import type { Client } from "@hiero-ledger/sdk";
import { z } from "zod";
import { settlementAccountKey } from "../keys";
import type { QuorumKeyShape } from "../types";

const quorumKeyInputSchema = z.object({
  committerPublicKey: z
    .string()
    .describe("Public key of the party that commits the funds and pre-signs each obligation"),
  attesterPublicKeys: z
    .array(z.string())
    .min(1)
    .describe("Public keys of the attesting agents that release a settlement"),
  threshold: z
    .number()
    .int()
    .min(1)
    .describe("How many attesters must sign to release a settlement (k of n)"),
});

type QuorumKeyInput = z.infer<typeof quorumKeyInputSchema>;

export class QuorumKeyTool extends BaseTool<QuorumKeyInput, QuorumKeyInput> {
  method = "settlement_quorum_key";
  name = "Build Settlement Quorum Key";
  description =
    "Build the and(committer, k-of-n attesters) key for a settlement account, without touching " +
    "the network. Use the returned key when creating the account that will fund conditional " +
    "settlements. Attesters holding this key can never spend from the account on their own.";
  parameters = quorumKeyInputSchema;

  async normalizeParams(
    params: QuorumKeyInput,
    _context: Context,
    _client: Client,
  ): Promise<QuorumKeyInput> {
    return quorumKeyInputSchema.parse(params);
  }

  async coreAction(
    args: QuorumKeyInput,
    _context: Context,
    _client: Client,
  ): Promise<QuorumKeyShape> {
    const key = settlementAccountKey(
      args.committerPublicKey,
      args.attesterPublicKeys,
      args.threshold,
    );
    return {
      shape: `and(committer, ${args.threshold}-of-${args.attesterPublicKeys.length} attesters)`,
      key: key.toString(),
      attesterCount: args.attesterPublicKeys.length,
      threshold: args.threshold,
    };
  }

  override async secondaryAction(_request: unknown, _client: Client, _context: Context) {
    return null;
  }
}

export const quorumKeyTool = new QuorumKeyTool();
