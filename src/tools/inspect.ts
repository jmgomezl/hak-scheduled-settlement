import { BaseTool, type Context } from "@hashgraph/hedera-agent-kit";
import { type Client, ScheduleId, ScheduleInfoQuery } from "@hiero-ledger/sdk";
import { z } from "zod";

const inspectInputSchema = z.object({
  scheduleId: z.string().describe("Schedule ID of the settlement to inspect"),
});

type InspectInput = z.infer<typeof inspectInputSchema>;

export class InspectSettlementTool extends BaseTool<InspectInput, InspectInput> {
  method = "settlement_inspect";
  name = "Inspect a Conditional Settlement";
  description =
    "Report whether a conditional settlement is still awaiting its attester quorum, has already " +
    "executed, or has lapsed — along with how many signatures have been collected so far.";
  parameters = inspectInputSchema;

  async normalizeParams(
    params: InspectInput,
    _context: Context,
    _client: Client,
  ): Promise<InspectInput> {
    return inspectInputSchema.parse(params);
  }

  async coreAction(args: InspectInput, _context: Context, client: Client) {
    const info = await new ScheduleInfoQuery()
      .setScheduleId(ScheduleId.fromString(args.scheduleId))
      .execute(client);

    const executed = info.executed !== null;
    const expiresAt = info.expirationTime?.toDate() ?? null;
    const lapsed = !executed && expiresAt !== null && expiresAt.getTime() < Date.now();
    const signatureCount = info.signers ? Array.from(info.signers).length : 0;

    return {
      scheduleId: args.scheduleId,
      state: executed ? "executed" : lapsed ? "lapsed" : "awaiting_quorum",
      executedAt: executed ? info.executed?.toDate().toISOString() : null,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      signatureCount,
      memo: info.scheduleMemo,
    };
  }

  override async secondaryAction(_request: unknown, _client: Client, _context: Context) {
    return null;
  }
}

export const inspectSettlementTool = new InspectSettlementTool();
