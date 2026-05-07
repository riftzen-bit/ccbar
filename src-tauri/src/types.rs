use serde::Serialize;

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenTotals {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_tokens: u64,
    pub cache_read_tokens: u64,
}

impl TokenTotals {
    pub fn add(&mut self, other: &TokenTotals) {
        self.input_tokens += other.input_tokens;
        self.output_tokens += other.output_tokens;
        self.cache_creation_tokens += other.cache_creation_tokens;
        self.cache_read_tokens += other.cache_read_tokens;
    }

    pub fn total(&self) -> u64 {
        self.input_tokens
            + self.output_tokens
            + self.cache_creation_tokens
            + self.cache_read_tokens
    }
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowSummary {
    pub tokens: TokenTotals,
    pub cost_usd: f64,
    pub message_count: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelBreakdown {
    pub model: String,
    pub family: String,
    pub tokens: TokenTotals,
    pub cost_usd: f64,
    pub message_count: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSummary {
    pub today: WindowSummary,
    pub last_7_days: WindowSummary,
    pub last_30_days: WindowSummary,
    pub all_time: WindowSummary,
    pub by_model_30d: Vec<ModelBreakdown>,
    pub daily_30d: Vec<DailyPoint>,
    pub quota: Option<QuotaStatus>,
    pub five_hour: Option<WindowQuota>,
    pub weekly: Option<WindowQuota>,
    pub login: LoginInfo,
    pub data_since: Option<String>, // YYYY-MM-DD of earliest event
}

/// Slim payload for the tray popup. Mirrors the fields the popup actually
/// renders so we don't re-walk 30 days of JSONL on every 30-second tick.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayStatus {
    pub quota: Option<QuotaStatus>,
    pub five_hour: Option<WindowQuota>,
    pub weekly: Option<WindowQuota>,
    pub login: LoginInfo,
}

/// Slim Codex payload for the tray popup.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexTrayStatus {
    pub connection: CodexConnection,
    pub five_hour: Option<WindowQuota>,
    pub weekly: Option<WindowQuota>,
    pub plan_type: Option<String>,
}

/// One Claude rate-limit window (5h rolling or weekly).
/// `percent_used` / `status` / `resets_at` are populated from
/// `anthropic-ratelimit-unified-{5h|weekly}-*` headers when present;
/// `tokens_used` / `cost_used_usd` are computed locally so the sub-line
/// ("12.4M tokens · ~$28") still has numbers when the headers are absent.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowQuota {
    pub status: Option<String>,    // "allowed" | "allowed_warning" | "rejected"
    pub percent_used: Option<f64>, // 0.0..=100.0
    pub resets_at: Option<String>, // RFC3339
    pub tokens_used: u64,          // local aggregate, always present
    pub cost_used_usd: f64,        // local cost from pricing.rs, always present
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyPoint {
    pub date: String, // YYYY-MM-DD
    pub tokens: TokenTotals,
    pub cost_usd: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaStatus {
    pub requests_remaining: Option<u64>,
    pub last_seen_at: String,
    pub model_served: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginInfo {
    pub logged_in: bool,
    pub claude_dir: String,
    pub session_count: u64,
    pub message: String,
}

/// Connection state for the Codex provider tab.
/// `connected` reflects whether ccbar holds a valid OAuth token in its own
/// keystore (NOT `~/.codex/auth.json` — that belongs to Codex CLI).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexConnection {
    pub connected: bool,
    pub email: Option<String>,
    pub expires_at: Option<String>, // RFC3339
    pub session_count: u64,
    pub codex_dir: String,
    pub message: Option<String>,
}

/// Codex full-parity dashboard payload. Mirrors `DashboardSummary` so the
/// frontend can reuse Hero/Daily/Windows/Models with provider-tweaked props.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexDashboardSummary {
    pub connection: CodexConnection,
    pub today: WindowSummary,
    pub last_7_days: WindowSummary,
    pub last_30_days: WindowSummary,
    pub all_time: WindowSummary,
    pub by_model_30d: Vec<ModelBreakdown>,
    pub daily_30d: Vec<DailyPoint>,
    pub five_hour: Option<WindowQuota>,
    pub weekly: Option<WindowQuota>,
    pub data_since: Option<String>,
    pub plan_type: Option<String>,
}
