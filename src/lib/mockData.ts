import type {
  CodexConnection,
  CodexDashboardSummary,
  CodexTrayStatus,
  DailyPoint,
  DashboardSummary,
  LoginInfo,
  ModelBreakdown,
  QuotaStatus,
  TokenTotals,
  TrayStatus,
  WindowQuota,
} from "./types";

const isoMinutesAgo = (m: number): string =>
  new Date(Date.now() - m * 60_000).toISOString();

const isoDaysAgo = (d: number): string =>
  new Date(Date.now() - d * 86_400_000).toISOString();

const dateDaysAgo = (d: number): string => {
  const dt = new Date(Date.now() - d * 86_400_000);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

const tokens = (i: number, o: number, cw: number, cr: number): TokenTotals => ({
  inputTokens: i,
  outputTokens: o,
  cacheCreationTokens: cw,
  cacheReadTokens: cr,
});

const todayTokens: TokenTotals = tokens(6_240_000, 11_080_000, 4_520_000, 28_960_000);
const last7Tokens: TokenTotals = tokens(38_500_000, 71_200_000, 26_800_000, 174_300_000);
const last30Tokens: TokenTotals = tokens(146_700_000, 273_400_000, 102_900_000, 668_500_000);
const allTimeTokens: TokenTotals = tokens(742_000_000, 1_388_000_000, 521_000_000, 3_180_000_000);

const daily30d: DailyPoint[] = (() => {
  const points: DailyPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const peakBoost = i === 6 ? 1.65 : i === 14 ? 1.4 : 1;
    const wave = 0.78 + 0.22 * Math.sin(i * 0.7);
    const base = 38_000_000 * wave * peakBoost;
    const inT = Math.round(base * 0.12);
    const outT = Math.round(base * 0.22);
    const cwT = Math.round(base * 0.09);
    const crT = Math.round(base * 0.57);
    const total = inT + outT + cwT + crT;
    points.push({
      date: dateDaysAgo(i),
      tokens: { inputTokens: inT, outputTokens: outT, cacheCreationTokens: cwT, cacheReadTokens: crT },
      costUsd: total * 0.000_000_82,
    });
  }
  return points;
})();

const byModel30d: ModelBreakdown[] = [
  {
    model: "claude-opus-4-7",
    family: "Opus",
    tokens: tokens(88_000_000, 164_000_000, 61_000_000, 401_000_000),
    costUsd: 542.18,
    messageCount: 5_184,
  },
  {
    model: "claude-sonnet-4-6",
    family: "Sonnet",
    tokens: tokens(36_700_000, 68_400_000, 25_700_000, 167_100_000),
    costUsd: 218.44,
    messageCount: 3_960,
  },
  {
    model: "claude-haiku-4-5-20251001",
    family: "Haiku",
    tokens: tokens(17_600_000, 32_800_000, 12_300_000, 80_200_000),
    costUsd: 96.80,
    messageCount: 2_276,
  },
  {
    model: "claude-haiku-3-5",
    family: "Haiku",
    tokens: tokens(4_400_000, 8_200_000, 3_900_000, 20_200_000),
    costUsd: 28.36,
    messageCount: 612,
  },
];

const goodQuota: QuotaStatus = {
  requestsRemaining: 87,
  lastSeenAt: isoMinutesAgo(12),
  modelServed: "claude-opus-4-7",
};

const lowQuota: QuotaStatus = {
  requestsRemaining: 8,
  lastSeenAt: isoMinutesAgo(4),
  modelServed: "claude-opus-4-7",
};

const staleQuota: QuotaStatus = {
  requestsRemaining: 142,
  lastSeenAt: isoMinutesAgo(96),
  modelServed: "claude-sonnet-4-6",
};

const baseLogin: LoginInfo = {
  loggedIn: true,
  claudeDir: "C:\\Users\\you\\.claude",
  sessionCount: 11,
  message: "Logged in · 11 active session windows.",
};

const notLoggedIn: LoginInfo = {
  loggedIn: false,
  claudeDir: "C:\\Users\\you\\.claude",
  sessionCount: 0,
  message:
    "No `~/.claude/projects/` directory with sessions found. Run `claude` in a terminal once to log in.",
};

const fiveHourFresh: WindowQuota = {
  status: "allowed",
  percentUsed: 62,
  resetsAt: new Date(Date.now() + 161 * 60_000).toISOString(),
  tokensUsed: 12_400_000,
  costUsedUsd: 28.4,
};

const weeklyFresh: WindowQuota = {
  status: "allowed",
  percentUsed: 23,
  resetsAt: (() => {
    // Next Sunday 23:59 local in ISO
    const now = new Date();
    const dow = now.getDay(); // 0 = Sun
    const daysUntilSunday = (7 - dow) % 7 || 7;
    const target = new Date(now);
    target.setDate(now.getDate() + daysUntilSunday);
    target.setHours(23, 59, 0, 0);
    return target.toISOString();
  })(),
  tokensUsed: 198_000_000,
  costUsedUsd: 72.1,
};

const fiveHourCritical: WindowQuota = {
  status: "rejected",
  percentUsed: 95,
  resetsAt: new Date(Date.now() + 47 * 60_000).toISOString(),
  tokensUsed: 38_700_000,
  costUsedUsd: 96.2,
};

const weeklyHigh: WindowQuota = {
  status: "allowed_warning",
  percentUsed: 78,
  resetsAt: weeklyFresh.resetsAt,
  tokensUsed: 612_000_000,
  costUsedUsd: 244.0,
};

// Empty-headers state — what this user actually sees today (only local
// aggregates available; percent/status/reset fields all null).
const fiveHourEmpty: WindowQuota = {
  status: null,
  percentUsed: null,
  resetsAt: null,
  tokensUsed: 12_400_000,
  costUsedUsd: 28.4,
};

const weeklyEmpty: WindowQuota = {
  status: null,
  percentUsed: null,
  resetsAt: null,
  tokensUsed: 198_000_000,
  costUsedUsd: 72.1,
};

const baseDashboard: DashboardSummary = {
  today: { tokens: todayTokens, costUsd: 41.82, messageCount: 496 },
  last7Days: { tokens: last7Tokens, costUsd: 248.57, messageCount: 3_124 },
  last30Days: { tokens: last30Tokens, costUsd: 885.78, messageCount: 12_032 },
  allTime: { tokens: allTimeTokens, costUsd: 4_217.12, messageCount: 58_204 },
  byModel30d,
  daily30d,
  quota: goodQuota,
  fiveHour: fiveHourFresh,
  weekly: weeklyFresh,
  login: baseLogin,
  dataSince: isoDaysAgo(23),
};

export const mockDashboard: DashboardSummary = baseDashboard;

export const mockDashboardQuotaLow: DashboardSummary = {
  ...baseDashboard,
  quota: lowQuota,
};

export const mockDashboardQuotaStale: DashboardSummary = {
  ...baseDashboard,
  quota: staleQuota,
};

export const mockDashboardNotLoggedIn: DashboardSummary = {
  ...baseDashboard,
  login: notLoggedIn,
};

export const mockLogin: LoginInfo = baseLogin;
export const mockLoginNotLoggedIn: LoginInfo = notLoggedIn;

export type MockVariant =
  | "default"
  | "quotaLow"
  | "quotaStale"
  | "notLoggedIn"
  | "trayFresh"
  | "trayEmpty"
  | "trayCritical"
  | "codexFresh"
  | "codexNotConnected"
  | "codexConnectedNoSessions"
  | "codexCritical";

export function pickDashboard(v: MockVariant): DashboardSummary {
  switch (v) {
    case "quotaLow":
      return mockDashboardQuotaLow;
    case "quotaStale":
      return mockDashboardQuotaStale;
    case "notLoggedIn":
      return mockDashboardNotLoggedIn;
    default:
      return mockDashboard;
  }
}

export function pickLogin(v: MockVariant): LoginInfo {
  return v === "notLoggedIn" ? mockLoginNotLoggedIn : mockLogin;
}

const trayFresh: TrayStatus = {
  quota: goodQuota,
  fiveHour: fiveHourFresh,
  weekly: weeklyFresh,
  login: baseLogin,
};

const trayEmpty: TrayStatus = {
  quota: goodQuota,
  fiveHour: fiveHourEmpty,
  weekly: weeklyEmpty,
  login: baseLogin,
};

const trayCritical: TrayStatus = {
  quota: lowQuota,
  fiveHour: fiveHourCritical,
  weekly: weeklyHigh,
  login: baseLogin,
};

// ---- Codex fixtures -----------------------------------------------------

const codexTodayTokens: TokenTotals = tokens(2_400_000, 6_300_000, 0, 18_400_000);
const codexLast7Tokens: TokenTotals = tokens(15_200_000, 39_600_000, 0, 112_500_000);
const codexLast30Tokens: TokenTotals = tokens(58_400_000, 152_300_000, 0, 432_700_000);
const codexAllTimeTokens: TokenTotals = tokens(232_000_000, 605_000_000, 0, 1_720_000_000);

const codexDaily30d: DailyPoint[] = (() => {
  const points: DailyPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const peakBoost = i === 4 ? 1.5 : i === 18 ? 1.3 : 1;
    const wave = 0.7 + 0.3 * Math.sin(i * 0.55);
    const base = 22_000_000 * wave * peakBoost;
    const inT = Math.round(base * 0.1);
    const outT = Math.round(base * 0.25);
    const crT = Math.round(base * 0.65);
    const total = inT + outT + crT;
    points.push({
      date: dateDaysAgo(i),
      tokens: { inputTokens: inT, outputTokens: outT, cacheCreationTokens: 0, cacheReadTokens: crT },
      costUsd: total * 0.000_000_45,
    });
  }
  return points;
})();

const codexByModel30d: ModelBreakdown[] = [
  {
    model: "gpt-5.5",
    family: "GPT-5.5",
    tokens: tokens(38_700_000, 100_200_000, 0, 286_400_000),
    costUsd: 1187.42,
    messageCount: 4_280,
  },
  {
    model: "gpt-5-codex",
    family: "GPT-5-Codex",
    tokens: tokens(12_400_000, 32_100_000, 0, 92_300_000),
    costUsd: 380.6,
    messageCount: 1_640,
  },
  {
    model: "gpt-5",
    family: "GPT-5",
    tokens: tokens(5_100_000, 13_200_000, 0, 38_000_000),
    costUsd: 156.8,
    messageCount: 720,
  },
  {
    model: "gpt-4.1",
    family: "GPT-4.1",
    tokens: tokens(2_200_000, 6_800_000, 0, 16_000_000),
    costUsd: 70.4,
    messageCount: 312,
  },
];

const codexFiveHourFresh: WindowQuota = {
  status: "allowed",
  percentUsed: 16,
  resetsAt: new Date(Date.now() + 142 * 60_000).toISOString(),
  tokensUsed: 4_200_000,
  costUsedUsd: 8.4,
};

const codexWeeklyFresh: WindowQuota = {
  status: "allowed",
  percentUsed: 11,
  resetsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  tokensUsed: 92_300_000,
  costUsedUsd: 184.0,
};

const codexFiveHourCritical: WindowQuota = {
  ...codexFiveHourFresh,
  status: "rejected",
  percentUsed: 94,
};

const codexConnectionFresh: CodexConnection = {
  connected: true,
  email: "you@example.com",
  expiresAt: new Date(Date.now() + 28 * 86_400_000).toISOString(),
  sessionCount: 142,
  codexDir: "C:\\Users\\you\\.codex",
  message: null,
};

const codexConnectionNotConnected: CodexConnection = {
  connected: false,
  email: null,
  expiresAt: null,
  sessionCount: 0,
  codexDir: "C:\\Users\\you\\.codex",
  message: null,
};

const codexConnectionConnectedNoSessions: CodexConnection = {
  connected: true,
  email: "you@example.com",
  expiresAt: new Date(Date.now() + 28 * 86_400_000).toISOString(),
  sessionCount: 0,
  codexDir: "C:\\Users\\you\\.codex",
  message: "No Codex sessions found yet. Run `codex` once to populate.",
};

const baseCodexDashboard: CodexDashboardSummary = {
  connection: codexConnectionFresh,
  today: { tokens: codexTodayTokens, costUsd: 12.4, messageCount: 184 },
  last7Days: { tokens: codexLast7Tokens, costUsd: 78.6, messageCount: 1_204 },
  last30Days: { tokens: codexLast30Tokens, costUsd: 314.7, messageCount: 4_840 },
  allTime: { tokens: codexAllTimeTokens, costUsd: 1_795.22, messageCount: 6_952 },
  byModel30d: codexByModel30d,
  daily30d: codexDaily30d,
  fiveHour: codexFiveHourFresh,
  weekly: codexWeeklyFresh,
  dataSince: isoDaysAgo(30),
  planType: "pro",
};

export const mockCodexDashboard: CodexDashboardSummary = baseCodexDashboard;

export const mockCodexNotConnected: CodexDashboardSummary = {
  ...baseCodexDashboard,
  connection: codexConnectionNotConnected,
  fiveHour: null,
  weekly: null,
};

export const mockCodexConnectedNoSessions: CodexDashboardSummary = {
  ...baseCodexDashboard,
  connection: codexConnectionConnectedNoSessions,
  today: { tokens: tokens(0, 0, 0, 0), costUsd: 0, messageCount: 0 },
  last7Days: { tokens: tokens(0, 0, 0, 0), costUsd: 0, messageCount: 0 },
  last30Days: { tokens: tokens(0, 0, 0, 0), costUsd: 0, messageCount: 0 },
  allTime: { tokens: tokens(0, 0, 0, 0), costUsd: 0, messageCount: 0 },
  byModel30d: [],
  daily30d: codexDaily30d.map((p) => ({
    ...p,
    tokens: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
    costUsd: 0,
  })),
  fiveHour: null,
  weekly: null,
};

export const mockCodexCritical: CodexDashboardSummary = {
  ...baseCodexDashboard,
  fiveHour: codexFiveHourCritical,
};

export function pickCodexDashboard(v: MockVariant): CodexDashboardSummary {
  switch (v) {
    case "codexNotConnected":
      return mockCodexNotConnected;
    case "codexConnectedNoSessions":
      return mockCodexConnectedNoSessions;
    case "codexCritical":
      return mockCodexCritical;
    case "codexFresh":
    default:
      return mockCodexDashboard;
  }
}

export function pickCodexConnection(v: MockVariant): CodexConnection {
  return pickCodexDashboard(v).connection;
}

export function pickCodexTrayStatus(v: MockVariant): CodexTrayStatus {
  const d = pickCodexDashboard(v);
  return {
    connection: d.connection,
    fiveHour: d.fiveHour,
    weekly: d.weekly,
    planType: d.planType,
  };
}

export function pickTrayStatus(v: MockVariant): TrayStatus {
  switch (v) {
    case "trayEmpty":
      return trayEmpty;
    case "trayCritical":
      return trayCritical;
    case "trayFresh":
    default:
      return trayFresh;
  }
}
