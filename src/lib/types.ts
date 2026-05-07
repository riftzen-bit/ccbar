export type TokenTotals = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
};

export type WindowSummary = {
  tokens: TokenTotals;
  costUsd: number;
  messageCount: number;
};

export type ModelBreakdown = {
  model: string;
  family: "Opus" | "Sonnet" | "Haiku" | "Other" | string;
  tokens: TokenTotals;
  costUsd: number;
  messageCount: number;
};

export type DailyPoint = {
  date: string;
  tokens: TokenTotals;
  costUsd: number;
};

export type QuotaStatus = {
  requestsRemaining: number | null;
  lastSeenAt: string;
  modelServed: string | null;
};

export type LoginInfo = {
  loggedIn: boolean;
  claudeDir: string;
  sessionCount: number;
  message: string;
};

export type DashboardSummary = {
  today: WindowSummary;
  last7Days: WindowSummary;
  last30Days: WindowSummary;
  allTime: WindowSummary;
  byModel30d: ModelBreakdown[];
  daily30d: DailyPoint[];
  quota: QuotaStatus | null;
  fiveHour: WindowQuota | null;
  weekly: WindowQuota | null;
  login: LoginInfo;
  dataSince: string | null;
};

/** One Claude rate-limit window. `percentUsed` / `status` / `resetsAt` are
 *  populated from `anthropic-ratelimit-unified-{5h|weekly}-*` headers when
 *  emitted; `tokensUsed` / `costUsedUsd` are local aggregates and always
 *  present. The popup renders an empty bar when `percentUsed === null`. */
export type WindowQuota = {
  status: string | null;          // "allowed" | "allowed_warning" | "rejected"
  percentUsed: number | null;     // 0..=100
  resetsAt: string | null;        // ISO 8601
  tokensUsed: number;
  costUsedUsd: number;
};

/** Slim payload for the tray popup — see `get_tray_status` in lib.rs. */
export type TrayStatus = {
  quota: QuotaStatus | null;
  fiveHour: WindowQuota | null;
  weekly: WindowQuota | null;
  login: LoginInfo;
};

/** Slim Codex payload for the tray popup — see `get_codex_tray_status`. */
export type CodexTrayStatus = {
  connection: CodexConnection;
  fiveHour: WindowQuota | null;
  weekly: WindowQuota | null;
  planType: string | null;
};

/** Codex provider connection state. `connected` reflects ccbar's OWN
 *  OAuth token — separate from `~/.codex/auth.json` (Codex CLI's token). */
export type CodexConnection = {
  connected: boolean;
  email: string | null;
  expiresAt: string | null;
  sessionCount: number;
  codexDir: string;
  message: string | null;
};

/** Full-parity dashboard payload for the Codex tab. */
export type CodexDashboardSummary = {
  connection: CodexConnection;
  today: WindowSummary;
  last7Days: WindowSummary;
  last30Days: WindowSummary;
  allTime: WindowSummary;
  byModel30d: ModelBreakdown[];
  daily30d: DailyPoint[];
  fiveHour: WindowQuota | null;
  weekly: WindowQuota | null;
  dataSince: string | null;
  planType: string | null;
};

export function tokenTotal(t: TokenTotals): number {
  return (
    t.inputTokens + t.outputTokens + t.cacheCreationTokens + t.cacheReadTokens
  );
}
