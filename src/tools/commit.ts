import { BaseTool, type Context, handleTransaction } from "@hashgraph/hedera-agent-kit";
import {
  AccountId,
  type Client,
  Hbar,
  ScheduleCreateTransaction,
  Timestamp,
  TokenId,
  TransferTransaction,
} from "@hiero-ledger/sdk";
import { z } from "zod";
import { DEFAULT_EXPIRY_SECONDS, MAX_EXPIRY_SECONDS } from "../types";

const commitInputSchema = z.object({
  fromAccountId: z.string().describe("Settlement account holding the committed funds"),
  toAccountId: z.string().describe("Beneficiary paid when the attester quorum releases"),
  amount: z.number().positive().describe("Amount to pay out; fixed at commit time"),
  tokenId: z.string().optional().describe("HTS token id; omit for HBAR"),
  expirySeconds: z
    .number()
    .int()
    .positive()
    .max(MAX_EXPIRY_SECONDS)
    .optional()
    .default(DEFAULT_EXPIRY_SECONDS)
    .describe(
      `Seconds until the obligation lapses if the quorum never signs (max ${MAX_EXPIRY_SECONDS} = 62 days)`,
    ),
  memo: z.string().max(100).optional().describe("Optional schedule memo"),
});

type CommitInput = z.infer<typeof commitInputSchema>;

interface CommitPayload {
  transaction: ScheduleCreateTransaction;
}

const isPayload = (value: unknown): value is CommitPayload =>
  typeof value === "object" && value !== null && "transaction" in value;

export class CommitSettlementTool extends BaseTool<CommitInput, CommitInput> {
  method = "settlement_commit";
  name = "Commit a Conditional Settlement";
  description =
    "Schedule a payout from a settlement account and satisfy the committer branch of its key now. " +
    "The obligation then sits on the ledger doing nothing until the attester quorum signs, at which " +
    "point the network executes it — no keeper, no polling. Amount and beneficiary are fixed here " +
    "and cannot change later.";
  parameters = commitInputSchema;

  async normalizeParams(
    params: CommitInput,
    _context: Context,
    _client: Client,
  ): Promise<CommitInput> {
    return commitInputSchema.parse(params);
  }

  async coreAction(args: CommitInput, _context: Context, _client: Client): Promise<CommitPayload> {
    const from = AccountId.fromString(args.fromAccountId);
    const to = AccountId.fromString(args.toAccountId);

    const inner = new TransferTransaction();
    if (args.tokenId) {
      const token = TokenId.fromString(args.tokenId);
      inner.addTokenTransfer(token, from, -args.amount).addTokenTransfer(token, to, args.amount);
    } else {
      inner
        .addHbarTransfer(from, new Hbar(-args.amount))
        .addHbarTransfer(to, new Hbar(args.amount));
    }

    const expirySeconds = args.expirySeconds ?? DEFAULT_EXPIRY_SECONDS;
    const transaction = new ScheduleCreateTransaction()
      .setScheduledTransaction(inner)
      .setScheduleMemo(args.memo ?? "conditional settlement")
      .setExpirationTime(Timestamp.fromDate(new Date(Date.now() + expirySeconds * 1000)))
      // false => execute the instant signatures suffice, rather than waiting for
      // expiry. This is what makes the settlement self-executing.
      .setWaitForExpiry(false);

    return { transaction };
  }

  override async shouldSecondaryAction(coreActionResult: unknown, _context: Context) {
    return isPayload(coreActionResult);
  }

  override async secondaryAction(payload: CommitPayload, client: Client, context: Context) {
    return await handleTransaction(
      payload.transaction,
      client,
      context,
      (response) =>
        `Settlement committed. Schedule ID: ${response.scheduleId?.toString()}. Committer branch satisfied; awaiting the attester quorum.`,
    );
  }
}

export const commitSettlementTool = new CommitSettlementTool();
