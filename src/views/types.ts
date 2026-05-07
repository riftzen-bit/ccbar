import type { QuotaPillProps } from "../lib/quotaPill";

/** Each provider view publishes its sync state up to the shell so the
 *  sticky header (quota pill, lastSync, Refresh button) reflects whichever
 *  tab is currently visible. */
export type ProviderViewHandle = {
  loading: boolean;
  lastSync: Date | null;
  onRefresh: () => void;
  /** null when the view has no data yet (initial load). */
  pill: QuotaPillProps | null;
  /** Optional small label shown in the header next to the brand
   *  (e.g. "11 sessions" for Claude, an email for Codex). */
  secondary?: string;
};

export type Provider = "claude" | "codex";
