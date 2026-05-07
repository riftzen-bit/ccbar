// Live quota probe — reads ~/.claude/.credentials.json once, fires a tiny
// Haiku /v1/messages call (max_tokens=1), and parses the
// anthropic-ratelimit-unified-{5h,weekly}-* response headers. Result is
// cached for `CACHE_TTL_SECS` so 30-second tray polling doesn't hammer the
// API or burn meaningful tokens (~$0.000007 per ping at most).
//
// Kill-switch: set env `CCBAR_LIVE_QUOTA=0` to disable, in which case this
// module returns `Ok(None)` and bars stay empty (legacy local-only mode).
//
// SECURITY: this module is the *only* place that reads credentials. The
// access token is never written to disk, never logged, never sent in events,
// never exposed via Tauri commands. It lives in memory only for the duration
// of the HTTPS POST.

use chrono::{DateTime, Utc};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const CACHE_TTL_SECS: u64 = 60;
const PING_MODEL: &str = "claude-haiku-4-5";
const PING_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveQuota {
    pub five_hour_status: Option<String>,
    pub five_hour_percent: Option<f64>,
    pub five_hour_resets_at: Option<String>,
    pub weekly_status: Option<String>,
    pub weekly_percent: Option<f64>,
    pub weekly_resets_at: Option<String>,
    pub fetched_at: DateTime<Utc>,
}

#[derive(Deserialize)]
struct CredsFile {
    #[serde(rename = "claudeAiOauth")]
    claude_ai_oauth: Option<OAuthCreds>,
}

#[derive(Deserialize)]
struct OAuthCreds {
    #[serde(rename = "accessToken")]
    access_token: String,
    #[serde(rename = "expiresAt", default)]
    expires_at: Option<i64>,
}

struct CacheEntry {
    fetched: Instant,
    value: Option<LiveQuota>,
}

static CACHE: Lazy<Mutex<Option<CacheEntry>>> = Lazy::new(|| Mutex::new(None));

fn enabled() -> bool {
    !matches!(std::env::var("CCBAR_LIVE_QUOTA").as_deref(), Ok("0"))
}

fn read_token(claude_dir: &Path) -> Option<String> {
    let creds_path = claude_dir.join(".credentials.json");
    let bytes = std::fs::read(&creds_path).ok()?;
    let parsed: CredsFile = serde_json::from_slice(&bytes).ok()?;
    let oauth = parsed.claude_ai_oauth?;
    // Don't probe if the token is already past expiry — the call would 401.
    if let Some(exp_ms) = oauth.expires_at {
        let now_ms = Utc::now().timestamp_millis();
        if now_ms >= exp_ms {
            return None;
        }
    }
    Some(oauth.access_token)
}

fn parse_headers(headers: &reqwest::header::HeaderMap) -> LiveQuota {
    // Confirmed by direct probe of api.anthropic.com with a Max OAuth token
    // (2026-05-06): real response headers use `-utilization` (0.0..1.0) for
    // the percentage and `-reset` (Unix seconds) for the reset time. The
    // weekly window is named `7d` not `weekly`. See CLAUDE.md.
    let get = |name: &str| -> Option<String> {
        headers
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string())
    };
    // Convert utilization fraction (0..1) → percent (0..100).
    let pct = |name: &str| -> Option<f64> {
        get(name).and_then(|s| s.parse::<f64>().ok()).map(|f| f * 100.0)
    };
    // Convert Unix epoch seconds → RFC3339 ISO string the frontend can format.
    let reset_iso = |name: &str| -> Option<String> {
        get(name).and_then(|s| s.parse::<i64>().ok()).and_then(|sec| {
            DateTime::<Utc>::from_timestamp(sec, 0).map(|dt| dt.to_rfc3339())
        })
    };
    LiveQuota {
        five_hour_status: get("anthropic-ratelimit-unified-5h-status"),
        five_hour_percent: pct("anthropic-ratelimit-unified-5h-utilization"),
        five_hour_resets_at: reset_iso("anthropic-ratelimit-unified-5h-reset"),
        weekly_status: get("anthropic-ratelimit-unified-7d-status"),
        weekly_percent: pct("anthropic-ratelimit-unified-7d-utilization"),
        weekly_resets_at: reset_iso("anthropic-ratelimit-unified-7d-reset"),
        fetched_at: Utc::now(),
    }
}

async fn fetch(token: &str) -> Result<LiveQuota, String> {
    let body = serde_json::json!({
        "model": PING_MODEL,
        "max_tokens": 1,
        "messages": [{"role": "user", "content": "."}]
    });
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(PING_URL)
        .header("Authorization", format!("Bearer {token}"))
        .header("anthropic-version", ANTHROPIC_VERSION)
        .header("anthropic-beta", "oauth-2025-04-20")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    // Even on 4xx we want the rate-limit headers, so parse them regardless
    // of status. 401 means the token is stale and we should NOT cache that
    // as a usable response — return error instead so caller can fall back.
    let status = resp.status();
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err("auth expired — run `claude` to re-login".to_string());
    }
    Ok(parse_headers(resp.headers()))
}

/// Returns the latest LiveQuota, fetching fresh if cache is stale or empty.
/// Returns `Ok(None)` if disabled by env, no credentials, or token expired.
/// Returns `Err` only on transient network failures (caller can retry).
pub async fn get_or_fetch(claude_dir: &Path) -> Result<Option<LiveQuota>, String> {
    if !enabled() {
        return Ok(None);
    }
    // Cache hit?
    if let Ok(guard) = CACHE.lock() {
        if let Some(entry) = guard.as_ref() {
            if entry.fetched.elapsed() < Duration::from_secs(CACHE_TTL_SECS) {
                return Ok(entry.value.clone());
            }
        }
    }
    let Some(token) = read_token(claude_dir) else {
        // No credentials or expired — cache an empty result for the TTL so we
        // don't re-read the file on every poll.
        if let Ok(mut guard) = CACHE.lock() {
            *guard = Some(CacheEntry {
                fetched: Instant::now(),
                value: None,
            });
        }
        return Ok(None);
    };
    let result = fetch(&token).await;
    match result {
        Ok(lq) => {
            let cloned = lq.clone();
            if let Ok(mut guard) = CACHE.lock() {
                *guard = Some(CacheEntry {
                    fetched: Instant::now(),
                    value: Some(lq),
                });
            }
            Ok(Some(cloned))
        }
        Err(e) => {
            // Cache "no value" briefly so we don't slam the API on repeated
            // failures. 10s instead of full TTL.
            if let Ok(mut guard) = CACHE.lock() {
                *guard = Some(CacheEntry {
                    fetched: Instant::now() - Duration::from_secs(CACHE_TTL_SECS - 10),
                    value: None,
                });
            }
            Err(e)
        }
    }
}
