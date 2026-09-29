// Shared per-row result shape for every Phase 10.10 bulk student operation
// (status change, batch transfer, promotion) — each row is its own
// independent outcome, never rolled into a single all-or-nothing result, so
// a caller can always show real Successful/Failed/Skipped counts with a
// reason per non-success row (AGENTS.md Phase 10.10 §26).
export interface StudentBulkOpResult {
  studentId: string;
  success: boolean;
  skipped?: boolean;
  reason?: string;
}
