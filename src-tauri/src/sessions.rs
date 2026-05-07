use anyhow::Result;
use chrono::{DateTime, Local, TimeZone, Utc};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;
use walkdir::WalkDir;

use crate::pricing::{cost_usd, family_for};
use crate::types::{DailyPoint, ModelBreakdown, TokenTotals, WindowSummary};

#[derive(Debug, Deserialize)]
struct LogEntry {
    #[serde(default)]
    r#type: Option<String>,
    #[serde(default)]
    timestamp: Option<String>,
    #[serde(default)]
    message: Option<AssistantMessage>,
}

#[derive(Debug, Deserialize)]
struct AssistantMessage {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    usage: Option<Usage>,
}

#[derive(Debug, Deserialize)]
struct Usage {
    #[serde(default)]
    input_tokens: Option<u64>,
    #[serde(default)]
    output_tokens: Option<u64>,
    #[serde(default)]
    cache_creation_input_tokens: Option<u64>,
    #[serde(default)]
    cache_read_input_tokens: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct AssistantEvent {
    pub timestamp: DateTime<Utc>,
    pub model: String,
    pub tokens: TokenTotals,
}

pub fn read_all_events(claude_dir: &Path) -> Result<Vec<AssistantEvent>> {
    let projects_dir = claude_dir.join("projects");
    if !projects_dir.exists() {
        return Ok(Vec::new());
    }

    let mut events = Vec::new();
    for entry in WalkDir::new(&projects_dir)
        .max_depth(3)
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
        if let Err(e) = parse_jsonl_into(path, &mut events) {
            eprintln!("ccbar: skip {}: {}", path.display(), e);
        }
    }
    Ok(events)
}

fn parse_jsonl_into(path: &Path, out: &mut Vec<AssistantEvent>) -> Result<()> {
    let f = File::open(path)?;
    let reader = BufReader::new(f);
    // Claude Code re-emits the same assistant message multiple times in the
    // session JSONL (initial response, after tool replies, summaries). Each
    // duplicate carries the same `message.id` and the same `usage`. Without
    // deduping per-file we over-count tokens by ~70%. Verified via Python
    // audit + cross-check across 7,140 duplicates in user's data.
    let mut seen_ids: HashSet<String> = HashSet::new();
    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };
        if line.trim().is_empty() {
            continue;
        }
        let entry: LogEntry = match serde_json::from_str(&line) {
            Ok(e) => e,
            Err(_) => continue,
        };
        if entry.r#type.as_deref() != Some("assistant") {
            continue;
        }
        let msg = match entry.message {
            Some(m) => m,
            None => continue,
        };
        // Skip duplicate assistant messages (same message.id appears
        // multiple times within the same session file).
        if let Some(ref id) = msg.id {
            if !seen_ids.insert(id.clone()) {
                continue;
            }
        }
        let usage = match msg.usage {
            Some(u) => u,
            None => continue,
        };
        let tokens = TokenTotals {
            input_tokens: usage.input_tokens.unwrap_or(0),
            output_tokens: usage.output_tokens.unwrap_or(0),
            cache_creation_tokens: usage.cache_creation_input_tokens.unwrap_or(0),
            cache_read_tokens: usage.cache_read_input_tokens.unwrap_or(0),
        };
        if tokens.total() == 0 {
            continue;
        }
        let model = msg.model.unwrap_or_else(|| "unknown".to_string());
        // Skip Claude Code's local synthetic responses — they're not real API usage.
        if model.starts_with('<') {
            continue;
        }
        let ts = entry
            .timestamp
            .as_deref()
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|d| d.with_timezone(&Utc))
            .unwrap_or_else(Utc::now);
        out.push(AssistantEvent {
            timestamp: ts,
            model,
            tokens,
        });
    }
    Ok(())
}

pub fn summarize_window<'a, I>(events: I) -> WindowSummary
where
    I: IntoIterator<Item = &'a AssistantEvent>,
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
    I: IntoIterator<Item = &'a AssistantEvent>,
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

/// Aggregate tokens + cost from events whose timestamp falls inside a
/// rolling 5-hour window ending at `now`. Used by the tray popup to render
/// the "12.4M tokens · ~$28" sub-line under the 5H bar.
pub fn aggregate_last_5h(
    events: &[AssistantEvent],
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

/// Aggregate tokens + cost since the start of the current ISO week (Monday
/// 00:00 LOCAL time). Used by the tray popup's WEEKLY bar sub-line.
pub fn aggregate_current_week(
    events: &[AssistantEvent],
    now: DateTime<Utc>,
) -> (TokenTotals, f64) {
    use chrono::{Datelike, Weekday};
    let today_local = now.with_timezone(&Local).date_naive();
    let days_back = match today_local.weekday() {
        Weekday::Mon => 0,
        Weekday::Tue => 1,
        Weekday::Wed => 2,
        Weekday::Thu => 3,
        Weekday::Fri => 4,
        Weekday::Sat => 5,
        Weekday::Sun => 6,
    };
    let monday = today_local - chrono::Duration::days(days_back);
    let monday_midnight_naive = monday.and_hms_opt(0, 0, 0).unwrap();
    let start = Local
        .from_local_datetime(&monday_midnight_naive)
        .earliest()
        .or_else(|| Local.from_local_datetime(&monday_midnight_naive).latest())
        .map(|d| d.with_timezone(&Utc))
        .unwrap_or_else(|| Utc.from_utc_datetime(&monday_midnight_naive));
    let mut tokens = TokenTotals::default();
    let mut cost = 0.0;
    for ev in events {
        if ev.timestamp >= start {
            tokens.add(&ev.tokens);
            cost += cost_usd(&ev.model, &ev.tokens);
        }
    }
    (tokens, cost)
}

pub fn daily_points<'a, I>(events: I, days: i64, today: chrono::NaiveDate) -> Vec<DailyPoint>
where
    I: IntoIterator<Item = &'a AssistantEvent>,
{
    let mut buckets: HashMap<String, (TokenTotals, f64)> = HashMap::new();
    for ev in events {
        // Bucket by LOCAL calendar date so a 23:30 local event lands on
        // today's bar (not tomorrow's UTC bar).
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
