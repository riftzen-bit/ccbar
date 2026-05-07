use anyhow::Result;
use serde::Deserialize;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

use crate::types::{QuotaStatus, WindowQuota};

#[derive(Debug, Deserialize)]
struct UsageLine {
    #[serde(default)]
    ts: Option<String>,
    #[serde(default)]
    rate: Option<RateHeaders>,
    #[serde(default)]
    model_served: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct RateHeaders {
    #[serde(rename = "anthropic-ratelimit-requests-remaining", default)]
    requests_remaining: Option<String>,

    // Unified 5h window (Claude Max plans). All optional — older Claude Code
    // versions don't emit these. Header names follow Anthropic's convention.
    #[serde(rename = "anthropic-ratelimit-unified-5h-status", default)]
    unified_5h_status: Option<String>,
    #[serde(rename = "anthropic-ratelimit-unified-5h-percent-used", default)]
    unified_5h_percent_used: Option<String>,
    #[serde(
        alias = "anthropic-ratelimit-unified-5h-resets-at",
        alias = "anthropic-ratelimit-unified-5h-reset",
        default
    )]
    unified_5h_resets_at: Option<String>,

    // Unified weekly window.
    #[serde(rename = "anthropic-ratelimit-unified-weekly-status", default)]
    unified_weekly_status: Option<String>,
    #[serde(rename = "anthropic-ratelimit-unified-weekly-percent-used", default)]
    unified_weekly_percent_used: Option<String>,
    #[serde(
        alias = "anthropic-ratelimit-unified-weekly-resets-at",
        alias = "anthropic-ratelimit-unified-weekly-reset",
        default
    )]
    unified_weekly_resets_at: Option<String>,
}

/// What we keep from each `usage.jsonl` line — everything that might feed
/// the dashboard or the tray popup. Walked lazily, returned only after we've
/// scanned the whole file (so the latest non-null wins per field).
#[derive(Default, Debug)]
pub struct LatestRateState {
    pub quota: Option<QuotaStatus>,
    pub five_hour_status: Option<String>,
    pub five_hour_percent: Option<f64>,
    pub five_hour_resets_at: Option<String>,
    pub weekly_status: Option<String>,
    pub weekly_percent: Option<f64>,
    pub weekly_resets_at: Option<String>,
}

/// Walk usage.jsonl once, keep the latest non-null value for each rate-limit
/// field independently. Different lines carry different headers (e.g. one
/// line emits requests-remaining, another emits the unified-5h status), so
/// taking only the last fully-populated line would miss data.
pub fn latest_rate_state(claude_dir: &Path) -> Result<LatestRateState> {
    let mut state = LatestRateState::default();
    let path = claude_dir.join("usage.jsonl");
    if !path.exists() {
        return Ok(state);
    }
    let f = File::open(&path)?;
    let reader = BufReader::new(f);
    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };
        if line.trim().is_empty() {
            continue;
        }
        let entry: UsageLine = match serde_json::from_str(&line) {
            Ok(e) => e,
            Err(_) => continue,
        };
        let Some(rate) = entry.rate else { continue };
        let ts = entry.ts.unwrap_or_default();

        if let Some(remaining) = rate.requests_remaining.as_deref().and_then(|s| s.parse::<u64>().ok()) {
            state.quota = Some(QuotaStatus {
                requests_remaining: Some(remaining),
                last_seen_at: ts.clone(),
                model_served: entry.model_served.clone(),
            });
        }

        if let Some(s) = rate.unified_5h_status {
            state.five_hour_status = Some(s);
        }
        if let Some(p) = rate.unified_5h_percent_used.as_deref().and_then(|s| s.parse::<f64>().ok()) {
            state.five_hour_percent = Some(p);
        }
        if let Some(r) = rate.unified_5h_resets_at {
            state.five_hour_resets_at = Some(r);
        }

        if let Some(s) = rate.unified_weekly_status {
            state.weekly_status = Some(s);
        }
        if let Some(p) = rate.unified_weekly_percent_used.as_deref().and_then(|s| s.parse::<f64>().ok()) {
            state.weekly_percent = Some(p);
        }
        if let Some(r) = rate.unified_weekly_resets_at {
            state.weekly_resets_at = Some(r);
        }
    }
    Ok(state)
}

/// Build a `WindowQuota` for the 5h or weekly window. Local token totals
/// are passed in (computed by `sessions.rs` from JSONL aggregation).
/// Returns `None` only if neither headers nor local data exist — that way
/// the popup doesn't render a row that has nothing to show.
pub fn build_window_quota(
    status: Option<String>,
    percent: Option<f64>,
    resets_at: Option<String>,
    tokens_used: u64,
    cost_used_usd: f64,
) -> Option<WindowQuota> {
    if status.is_none() && percent.is_none() && resets_at.is_none() && tokens_used == 0 {
        return None;
    }
    Some(WindowQuota {
        status,
        percent_used: percent,
        resets_at,
        tokens_used,
        cost_used_usd,
    })
}
