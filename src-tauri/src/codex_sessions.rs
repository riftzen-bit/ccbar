// Walks `~/.codex/sessions/**/*.jsonl` and `~/.codex/archived_sessions/*.jsonl`
// and aggregates token usage + rate-limit signals for the Codex provider tab.
//
// Source format (per `event_msg` whose payload type is `token_count`):
//
//   {"timestamp":"…",
//    "type":"event_msg",
//    "payload":{
//      "type":"token_count",
//      "info":{
//        "total_token_usage":{...},          // running cumulative for the session
//        "last_token_usage":{                 // per-turn delta (what we sum)
//          "input_tokens":50876,              // INCLUDES cached_input_tokens
//          "cached_input_tokens":27392,
//          "output_tokens":1130,              // INCLUDES reasoning_output_tokens
//          "reasoning_output_tokens":550,
//          "total_tokens":52006
//        }
//      },
//      "rate_limits":{                        // present on most token_count events
//        "primary":{"used_percent":16.0,"window_minutes":300,"resets_at":1778125213},
//        "secondary":{"used_percent":11.0,"window_minutes":10080,"resets_at":1778542547},
//        "plan_type":"pro",
//        "rate_limit_reached_type":null
//      }
//    }
//   }
//
// `model` for each token_count event is the *most recent* `turn_context` event
// in the same file (each turn switches it via `payload.model`).

use anyhow::Result;
use chrono::{DateTime, Local, Utc};
use serde::Deserialize;
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;
use walkdir::WalkDir;

use crate::codex_pricing::{cost_usd, family_for};
use crate::types::{DailyPoint, ModelBreakdown, TokenTotals, WindowSummary};

#[derive(Debug, Clone)]
pub struct CodexEvent {
    pub timestamp: DateTime<Utc>,
    pub model: String,
    pub tokens: TokenTotals,
}

/// Snapshot of the latest rate-limit info seen in any `token_count` event.
#[derive(Debug, Clone, Default)]
pub struct CodexRateState {
    pub primary_percent: Option<f64>,
    pub primary_window_minutes: Option<u64>,
    pub primary_resets_at: Option<String>,
    pub primary_status: Option<String>,
    pub secondary_percent: Option<f64>,
    pub secondary_window_minutes: Option<u64>,
    pub secondary_resets_at: Option<String>,
    pub secondary_status: Option<String>,
    pub plan_type: Option<String>,
    pub fetched_at: Option<DateTime<Utc>>,
}

pub struct CodexAggregate {
    pub events: Vec<CodexEvent>,
    pub rate: CodexRateState,
}

#[derive(Debug, Deserialize)]
struct LineEnvelope {
    #[serde(default)]
    timestamp: Option<String>,
    #[serde(default)]
    r#type: Option<String>,
    #[serde(default)]
    payload: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct TokenCountInfo {
    last_token_usage: Option<TokenUsage>,
}

#[derive(Debug, Deserialize)]
struct TokenUsage {
    #[serde(default)]
    input_tokens: u64,
    #[serde(default)]
    cached_input_tokens: u64,
    #[serde(default)]
    output_tokens: u64,
}

#[derive(Debug, Deserialize)]
struct RateLimitsBlock {
    #[serde(default)]
    primary: Option<RateWindow>,
    #[serde(default)]
    secondary: Option<RateWindow>,
    #[serde(default)]
    plan_type: Option<String>,
    #[serde(default)]
    rate_limit_reached_type: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RateWindow {
    #[serde(default)]
    used_percent: Option<f64>,
    #[serde(default)]
    window_minutes: Option<u64>,
    #[serde(default)]
    resets_at: Option<i64>, // Unix seconds
}

/// Read every `~/.codex/sessions/**/*.jsonl` and `~/.codex/archived_sessions/*.jsonl`.
/// Returns the per-turn token events and a snapshot of the latest rate-limit
/// state seen across all files.
pub fn read_codex_events(home: &Path) -> Result<CodexAggregate> {
    let codex_dir = home.join(".codex");
    let mut agg = CodexAggregate {
        events: Vec::new(),
        rate: CodexRateState::default(),
    };
    if !codex_dir.exists() {
        return Ok(agg);
    }

    let roots = [codex_dir.join("sessions"), codex_dir.join("archived_sessions")];
    for root in roots.iter() {
        if !root.exists() {
            continue;
        }
        for entry in WalkDir::new(root)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            if path.extension().and_then(|s| s.to_str()) != Some("jsonl") {
                continue;
            }
            if let Err(e) = parse_one_file(path, &mut agg) {
                eprintln!("ccbar: skip codex {}: {}", path.display(), e);
            }
        }
    }

    Ok(agg)
}

fn parse_one_file(path: &Path, agg: &mut CodexAggregate) -> Result<()> {
    let f = File::open(path)?;
    let reader = BufReader::new(f);
    let mut current_model: String = String::new();
    // Codex emits duplicate `token_count` events with the SAME `last_token_usage`
    // (one per intermediate step within a turn). Without dedup we over-count by
    // ~12%. Skip if the (input, cached, output) tuple is identical to the
    // previous accepted event in this session.
    // Verified against state_5.threads.tokens_used: dedup matches exactly.
    let mut prev_last: Option<(u64, u64, u64)> = None;
    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };
        if line.trim().is_empty() {
            continue;
        }
        let env: LineEnvelope = match serde_json::from_str(&line) {
            Ok(e) => e,
            Err(_) => continue,
        };
        let ts = match env
            .timestamp
            .as_deref()
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        {
            Some(t) => t.with_timezone(&Utc),
            None => continue,
        };
        let Some(payload) = env.payload else { continue };

        match env.r#type.as_deref() {
            Some("turn_context") => {
                if let Some(m) = payload.get("model").and_then(|v| v.as_str()) {
                    current_model = m.to_string();
                }
            }
            Some("session_meta") => {
                // Some sessions specify model at session level.
                if let Some(m) = payload.get("model").and_then(|v| v.as_str()) {
                    if current_model.is_empty() {
                        current_model = m.to_string();
                    }
                }
            }
            Some("event_msg") => {
                let Some(inner_type) = payload.get("type").and_then(|v| v.as_str()) else {
                    continue;
                };
                if inner_type != "token_count" {
                    continue;
                }
                // 1. Token usage (incremental delta) — dedupe duplicates.
                if let Some(info_v) = payload.get("info") {
                    if !info_v.is_null() {
                        if let Ok(info) = serde_json::from_value::<TokenCountInfo>(info_v.clone()) {
                            if let Some(usage) = info.last_token_usage {
                                let cached = usage.cached_input_tokens;
                                let raw_input = usage.input_tokens;
                                let out = usage.output_tokens;
                                let sig = (raw_input, cached, out);
                                // Skip duplicate token_count events (same last_token_usage
                                // emitted multiple times across intermediate steps in a turn).
                                if prev_last == Some(sig) {
                                    // duplicate — drop
                                } else {
                                    prev_last = Some(sig);
                                    let fresh_input = raw_input.saturating_sub(cached);
                                    let tokens = TokenTotals {
                                        input_tokens: fresh_input,
                                        output_tokens: out,
                                        cache_creation_tokens: 0,
                                        cache_read_tokens: cached,
                                    };
                                    if tokens.total() > 0 {
                                        let model = if current_model.is_empty() {
                                            "gpt-5".to_string()
                                        } else {
                                            current_model.clone()
                                        };
                                        agg.events.push(CodexEvent {
                                            timestamp: ts,
                                            model,
                                            tokens,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
                // 2. Rate limits — keep latest by timestamp.
                if let Some(rate_v) = payload.get("rate_limits") {
                    if !rate_v.is_null() {
                        if let Ok(rl) =
                            serde_json::from_value::<RateLimitsBlock>(rate_v.clone())
                        {
                            let newer = match agg.rate.fetched_at {
                                Some(prev) => ts > prev,
                                None => true,
                            };
                            if newer {
                                let status_for = |reached: &Option<String>| -> Option<String> {
                                    match reached.as_deref() {
                                        Some("primary") | Some("secondary") => {
                                            Some("rejected".to_string())
                                        }
                                        _ => Some("allowed".to_string()),
                                    }
                                };
                                if let Some(p) = rl.primary {
                                    agg.rate.primary_percent = p.used_percent;
                                    agg.rate.primary_window_minutes = p.window_minutes;
                                    agg.rate.primary_resets_at = p.resets_at.and_then(unix_to_iso);
                                    agg.rate.primary_status = status_for(&rl.rate_limit_reached_type);
                                }
                                if let Some(s) = rl.secondary {
                                    agg.rate.secondary_percent = s.used_percent;
                                    agg.rate.secondary_window_minutes = s.window_minutes;
                                    agg.rate.secondary_resets_at = s.resets_at.and_then(unix_to_iso);
                                    agg.rate.secondary_status = status_for(&rl.rate_limit_reached_type);
                                }
                                if rl.plan_type.is_some() {
                                    agg.rate.plan_type = rl.plan_type;
                                }
                                agg.rate.fetched_at = Some(ts);
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }
    Ok(())
}

fn unix_to_iso(sec: i64) -> Option<String> {
    DateTime::<Utc>::from_timestamp(sec, 0).map(|d| d.to_rfc3339())
}

pub fn summarize_window<'a, I>(events: I) -> WindowSummary
where
    I: IntoIterator<Item = &'a CodexEvent>,
{
    let mut s = WindowSummary::default();
    for ev in events {
        s.tokens.add(&ev.tokens);
        s.cost_usd += cost_usd(&ev.model, &ev.tokens);
        s.message_count += 1;
    }
    s
}

pub fn breakdown_by_model<'a, I>(events: I) -> Vec<ModelBreakdown>
where
    I: IntoIterator<Item = &'a CodexEvent>,
{
    let mut acc: HashMap<String, (TokenTotals, f64, u64)> = HashMap::new();
    for ev in events {
        let entry = acc.entry(ev.model.clone()).or_default();
        entry.0.add(&ev.tokens);
        entry.1 += cost_usd(&ev.model, &ev.tokens);
        entry.2 += 1;
    }
    let mut out: Vec<ModelBreakdown> = acc
        .into_iter()
        .map(|(model, (tokens, cost_usd, message_count))| ModelBreakdown {
            family: family_for(&model).to_string(),
            model,
            tokens,
            cost_usd,
            message_count,
        })
        .collect();
    out.sort_by(|a, b| b.tokens.total().cmp(&a.tokens.total()));
    out
}

pub fn daily_points<'a, I>(events: I, days: i64, today: chrono::NaiveDate) -> Vec<DailyPoint>
where
    I: IntoIterator<Item = &'a CodexEvent>,
{
    let mut buckets: HashMap<String, (TokenTotals, f64)> = HashMap::new();
    for ev in events {
        // Bucket by LOCAL calendar date so the chart matches user's wall clock.
        let date = ev.timestamp.with_timezone(&Local).date_naive();
        let key = date.format("%Y-%m-%d").to_string();
        let entry = buckets.entry(key).or_default();
        entry.0.add(&ev.tokens);
        entry.1 += cost_usd(&ev.model, &ev.tokens);
    }
    let mut out = Vec::with_capacity(days as usize);
    for offset in (0..days).rev() {
        let d = today - chrono::Duration::days(offset);
        let key = d.format("%Y-%m-%d").to_string();
        let (tokens, cost) = buckets.remove(&key).unwrap_or_default();
        out.push(DailyPoint {
            date: key,
            tokens,
            cost_usd: cost,
        });
    }
    out
}

/// Aggregate the last rolling 5-hour window. Used for the 5h Codex quota tile.
pub fn aggregate_last_5h(
    events: &[CodexEvent],
    now: DateTime<Utc>,
) -> (TokenTotals, f64) {
    let cutoff = now - chrono::Duration::hours(5);
    let mut tokens = TokenTotals::default();
    let mut cost = 0.0;
    for ev in events {
        if ev.timestamp >= cutoff {
            tokens.add(&ev.tokens);
            cost += cost_usd(&ev.model, &ev.tokens);
        }
    }
    (tokens, cost)
}

/// Aggregate last 7 days (Codex's "secondary" window is rolling 7d, not ISO week).
pub fn aggregate_last_7d(events: &[CodexEvent], now: DateTime<Utc>) -> (TokenTotals, f64) {
    let cutoff = now - chrono::Duration::days(7);
    let mut tokens = TokenTotals::default();
    let mut cost = 0.0;
    for ev in events {
        if ev.timestamp >= cutoff {
            tokens.add(&ev.tokens);
            cost += cost_usd(&ev.model, &ev.tokens);
        }
    }
    (tokens, cost)
}

/// Count distinct session JSONL files found under `~/.codex/sessions/`.
/// Used by the connection card to show "X sessions detected".
pub fn count_sessions(home: &Path) -> u64 {
    let mut n: u64 = 0;
    let codex_dir = home.join(".codex");
    let roots = [codex_dir.join("sessions"), codex_dir.join("archived_sessions")];
    for root in roots.iter() {
        if !root.exists() {
            continue;
        }
        for entry in WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
            let p = entry.path();
            if p.is_file() && p.extension().and_then(|s| s.to_str()) == Some("jsonl") {
                n += 1;
            }
        }
    }
    n
}
