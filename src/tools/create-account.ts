import { BaseTool, type Context, handleTransaction } from "@hashgraph/hedera-agent-kit";
import { AccountCreateTransaction, type Client, Hbar } from "@hiero-ledger/sdk";
import { z } from "zod";
import { settlementAccountKey } from "../keys";

const createAccountInputSchema = z.object({
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
  initialBalance: z
    .number()
    .min(0)
    .optional()
    .default(0)
    .describe("HBAR to fund the settlement account with"),
  accountMemo: z.string().max(100).optional().describe("Optional memo for the account"),
});

type CreateAccountInput = z.infer<typeof createAccountInputSchema>;

interface CreateAccountPayload {
  transaction: AccountCreateTransaction;
}

const isPayload = (value: unknown): value is CreateAccountPayload =>
  typeof value === "object" && value !== null && "transaction" in value;

export class CreateSettlementAccountTool extends BaseTool<CreateAccountInput, CreateAccountInput> {
  method = "settlement_create_account";
  name = "Create Settlement Account";
  description =
    "Create an account whose key is and(committer, k-of-n attesters), so it can fund conditional " +
    "settlements that only that quorum can release — and that the quorum alone can never drain. " +
    "Core account creation cannot express this nested key shape.";
  parameters = createAccountInputSchema;

  async normalizeParams(
    params: CreateAccountInput,
    _context: Context,
    _client: Client,
  ): Promise<CreateAccountInput> {
    return createAccountInputSchema.parse(params);
  }

  async coreAction(
    args: CreateAccountInput,
    _context: Context,
    _client: Client,
  ): Promise<CreateAccountPayload> {
    const key = settlementAccountKey(
      args.committerPublicKey,
      args.attesterPublicKeys,
      args.threshold,
    );

    const transaction = new AccountCreateTransaction()
      .setKeyWithoutAlias(key)
      .setInitialBalance(new Hbar(args.initialBalance ?? 0))
      // A settlement account receives funds from many parties; requiring a
      // signature to receive would put the quorum in the path of every deposit.
      .setReceiverSignatureRequired(false);

    if (args.accountMemo) {
      transaction.setAccountMemo(args.accountMemo);
    }

    return { transaction };
  }

  override async shouldSecondaryAction(coreActionResult: unknown, _context: Context) {
    return isPayload(coreActionResult);
  }

  override async secondaryAction(payload: CreateAccountPayload, client: Client, context: Context) {
    return await handleTransaction(
      payload.transaction,
      client,
      context,
      (response) =>
        `Settlement account created. Account ID: ${response.accountId?.toString()}. Transaction ID: ${response.transactionId}`,
    );
  }
}

export const createSettlementAccountTool = new CreateSettlementAccountTool();
