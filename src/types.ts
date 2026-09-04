/** Hedera caps a scheduled transaction's lifetime at 62 days. */
export const MAX_EXPIRY_SECONDS = 5_356_800;

/** Default obligation term, chosen to sit comfortably inside the ledger cap. */
export const DEFAULT_EXPIRY_SECONDS = 2_592_000; // 30 days

export interface QuorumKeyShape {
  /** Human-readable description, e.g. "and(committer, 2-of-3 attesters)". */
  shape: string;
  /** Serialized key, ready to pass to an account-creating transaction. */
  key: string;
  attesterCount: number;
  threshold: number;
}
