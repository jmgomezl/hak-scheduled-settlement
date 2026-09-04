import type { Plugin } from "@hashgraph/hedera-agent-kit";
import { commitSettlementTool } from "./tools/commit";
import { createSettlementAccountTool } from "./tools/create-account";
import { inspectSettlementTool } from "./tools/inspect";
import { quorumKeyTool } from "./tools/quorum-key";

export { attesterQuorumKey, settlementAccountKey } from "./keys";
export { DEFAULT_EXPIRY_SECONDS, MAX_EXPIRY_SECONDS } from "./types";
export type { QuorumKeyShape } from "./types";

export const scheduledSettlementToolNames = {
  SETTLEMENT_QUORUM_KEY_TOOL: "settlement_quorum_key",
  SETTLEMENT_CREATE_ACCOUNT_TOOL: "settlement_create_account",
  SETTLEMENT_COMMIT_TOOL: "settlement_commit",
  SETTLEMENT_INSPECT_TOOL: "settlement_inspect",
} as const;

export const scheduledSettlementPlugin: Plugin = {
  name: "scheduled-settlement",
  description:
    "Conditional settlement on Hedera: funds held in an and(committer, k-of-n attesters) account " +
    "and released by pre-signed Scheduled Transactions, with no smart contract and no keeper.",
  tools: () => [
    quorumKeyTool,
    createSettlementAccountTool,
    commitSettlementTool,
    inspectSettlementTool,
  ],
};

export { scheduledSettlementPlugin as default };
