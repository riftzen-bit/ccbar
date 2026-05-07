mod codex_oauth;
mod codex_pricing;
mod codex_sessions;
mod live_quota;
mod pricing;
mod sessions;
mod tray;
mod types;
mod usage;

use chrono::{Duration, Local, NaiveDate, TimeZone, Utc};
use std::path::PathBuf;
use walkdir::WalkDir;

use crate::live_quota::LiveQuota;
use crate::sessions::{
    aggregate_current_week, aggregate_last_5h, breakdown_by_model, daily_points, read_all_events,
    summarize_window,
};
use crate::types::{
    CodexConnection, CodexDashboardSummary, CodexTrayStatus, DashboardSummary, LoginInfo,
    TrayStatus, WindowSummary,
};
use crate::usage::{build_window_quota, latest_rate_state, LatestRateState};

fn claude_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude"))
}

fn login_info(dir: &std::path::Path) -> LoginInfo {
    let projects_dir = dir.join("projects");
    if !projects_dir.exists() {
        return LoginInfo {
            logged_in: false,
            claude_dir: dir.to_string_lossy().to_string(),
            session_count: 0,
            message:
                "~/.claude/projects/ not found. Run the `claude` CLI once to sign in."
                    .to_string(),
        };
    }
    let mut session_count: u64 = 0;
    for entry in WalkDir::new(&projects_dir)
        .max_depth(3)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.path().is_file()
            && entry.path().extension().and_then(|s| s.to_str()) == Some("jsonl")
        {
            session_count += 1;
        }
    }
    let logged_in = session_count > 0;
    LoginInfo {
        logged_in,
        claude_dir: dir.to_string_lossy().to_string(),
        session_count,
        message: if logged_in {
            format!("Detected {} session(s).", session_count)
        } else {
            "Directory exists but no sessions yet.".to_string()
        },
    }
}

/// "Today" anchored to the user's local timezone, returned as the UTC
/// instant of local-midnight today. Events parsed from JSONL are UTC, so we
/// compare them against this UTC moment after converting local-midnight back.
fn local_today_start_utc() -> (NaiveDate, chrono::DateTime<Utc>) {
    let today = Local::now().date_naive();
    let naive_midnight = today.and_hms_opt(0, 0, 0).unwrap();
    let local_midnight = Local
        .from_local_datetime(&naive_midnight)
        .earliest()
        .or_else(|| Local.from_local_datetime(&naive_midnight).latest())
        .unwrap_or_else(|| Utc.from_utc_datetime(&naive_midnight).with_timezone(&Local));
    (today, local_midnight.with_timezone(&Utc))
}

/// Merge a live `LiveQuota` (from API) on top of `LatestRateState` (from
/// usage.jsonl). Live values win when present; jsonl values are the fallback.
/// This is what makes the bars fill: live percentages flow through here.
fn merge_rate(rate: LatestRateState, live: Option<LiveQuota>) -> LatestRateState {
    let Some(lq) = live else { return rate };
    LatestRateState {
        quota: rate.quota,
        five_hour_status: lq.five_hour_status.or(rate.five_hour_status),
        five_hour_percent: lq.five_hour_percent.or(rate.five_hour_percent),
        five_hour_resets_at: lq.five_hour_resets_at.or(rate.five_hour_resets_at),
        weekly_status: lq.weekly_status.or(rate.weekly_status),
        weekly_percent: lq.weekly_percent.or(rate.weekly_percent),
        weekly_resets_at: lq.weekly_resets_at.or(rate.weekly_resets_at),
    }
}

#[tauri::command]
async fn get_dashboard() -> Result<DashboardSummary, String> {
    let dir = claude_dir().ok_or_else(|| "Could not resolve home directory".to_string())?;
    let login = login_info(&dir);

    if !login.logged_in {
        return Ok(DashboardSummary {
            today: WindowSummary::default(),
            last_7_days: WindowSummary::default(),
            last_30_days: WindowSummary::default(),
            all_time: WindowSummary::default(),
            by_model_30d: Vec::new(),
            daily_30d: Vec::new(),
            quota: None,
            five_hour: None,
            weekly: None,
            login,
            data_since: None,
        });
    }

    let events = read_all_events(&dir).map_err(|e| e.to_string())?;
    let now = Utc::now();
    // Anchor "today" / "30 days" buckets to the user's LOCAL timezone so
    // the rightmost bar matches the user's wall clock, not UTC.
    let (today_naive, start_today) = local_today_start_utc();
    let start_7 = now - Duration::days(7);
    let start_30 = now - Duration::days(30);

    let today = summarize_window(events.iter().filter(|e| e.timestamp >= start_today));
    let last_7_days = summarize_window(events.iter().filter(|e| e.timestamp >= start_7));
    let last_30_days = summarize_window(events.iter().filter(|e| e.timestamp >= start_30));
    let all_time = summarize_window(events.iter());

    let by_model_30d = breakdown_by_model(events.iter().filter(|e| e.timestamp >= start_30));
    let daily_30d = daily_points(
        events.iter().filter(|e| e.timestamp >= start_30),
        30,
        today_naive,
    );

    let rate_jsonl = latest_rate_state(&dir).map_err(|e| e.to_string())?;
    // Live ping is best-effort — network failure / expired token just falls
    // back to whatever usage.jsonl gave us.
    let live = live_quota::get_or_fetch(&dir).await.unwrap_or(None);
    let rate = merge_rate(rate_jsonl, live);
    let (h5_tokens, h5_cost) = aggregate_last_5h(&events, now);
    let (wk_tokens, wk_cost) = aggregate_current_week(&events, now);
    let five_hour = build_window_quota(
        rate.five_hour_status.clone(),
        rate.five_hour_percent,
        rate.five_hour_resets_at.clone(),
        h5_tokens.total(),
        h5_cost,
    );
    let weekly = build_window_quota(
        rate.weekly_status.clone(),
        rate.weekly_percent,
        rate.weekly_resets_at.clone(),
        wk_tokens.total(),
        wk_cost,
    );

    let data_since = events
        .iter()
        .map(|e| e.timestamp)
        .min()
        .map(|t| t.with_timezone(&Local).date_naive().format("%Y-%m-%d").to_string());

    Ok(DashboardSummary {
        today,
        last_7_days,
        last_30_days,
        all_time,
        by_model_30d,
        daily_30d,
        quota: rate.quota,
        five_hour,
        weekly,
        login,
        data_since,
    })
}

#[tauri::command]
fn get_login_info() -> Result<LoginInfo, String> {
    let dir = claude_dir().ok_or_else(|| "Could not resolve home directory".to_string())?;
    Ok(login_info(&dir))
}

/// Slim payload for the tray popup. Computes only the 5h + weekly windows
/// and the latest rate state — skips the 30-day daily history walk that
/// `get_dashboard` does.
#[tauri::command]
async fn get_tray_status() -> Result<TrayStatus, String> {
    let dir = claude_dir().ok_or_else(|| "Could not resolve home directory".to_string())?;
    let login = login_info(&dir);
    if !login.logged_in {
        return Ok(TrayStatus {
            quota: None,
            five_hour: None,
            weekly: None,
            login,
        });
    }
    let events = read_all_events(&dir).map_err(|e| e.to_string())?;
    let now = Utc::now();
    let rate_jsonl = latest_rate_state(&dir).map_err(|e| e.to_string())?;
    let live = live_quota::get_or_fetch(&dir).await.unwrap_or(None);
    let rate = merge_rate(rate_jsonl, live);
    let (h5_tokens, h5_cost) = aggregate_last_5h(&events, now);
    let (wk_tokens, wk_cost) = aggregate_current_week(&events, now);
    let five_hour = build_window_quota(
        rate.five_hour_status.clone(),
        rate.five_hour_percent,
        rate.five_hour_resets_at.clone(),
        h5_tokens.total(),
        h5_cost,
    );
    let weekly = build_window_quota(
        rate.weekly_status.clone(),
        rate.weekly_percent,
        rate.weekly_resets_at.clone(),
        wk_tokens.total(),
        wk_cost,
    );
    Ok(TrayStatus {
        quota: rate.quota,
        five_hour,
        weekly,
        login,
    })
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// Slim Codex payload for the tray popup. Same shape as `get_tray_status`.
#[tauri::command]
async fn get_codex_tray_status() -> Result<CodexTrayStatus, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not resolve home directory".to_string())?;
    let codex_dir = home.join(".codex");
    let session_count = codex_sessions::count_sessions(&home);
    let codex_dir_str = codex_dir.to_string_lossy().to_string();
    let mut connection = codex_oauth::connection(session_count, codex_dir_str.clone())
        .await
        .unwrap_or(CodexConnection {
            connected: false,
            email: None,
            expires_at: None,
            session_count,
            codex_dir: codex_dir_str.clone(),
            message: None,
        });
    if connection.message.is_none() {
        connection.message = if !codex_dir.exists() {
            Some("~/.codex/ not found".to_string())
        } else if session_count == 0 {
            Some("No Codex sessions yet".to_string())
        } else {
            None
        };
    }

    let agg = codex_sessions::read_codex_events(&home).map_err(|e| e.to_string())?;
    let events = &agg.events;
    let now = Utc::now();

    let (h5_tokens, h5_cost) = codex_sessions::aggregate_last_5h(events, now);
    let (wk_tokens, wk_cost) = codex_sessions::aggregate_last_7d(events, now);
    let five_hour = build_window_quota(
        agg.rate.primary_status.clone(),
        agg.rate.primary_percent,
        agg.rate.primary_resets_at.clone(),
        h5_tokens.total(),
        h5_cost,
    );
    let weekly = build_window_quota(
        agg.rate.secondary_status.clone(),
        agg.rate.secondary_percent,
        agg.rate.secondary_resets_at.clone(),
        wk_tokens.total(),
        wk_cost,
    );

    Ok(CodexTrayStatus {
        connection,
        five_hour,
        weekly,
        plan_type: agg.rate.plan_type,
    })
}

#[tauri::command]
async fn codex_login() -> Result<CodexConnection, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not resolve home directory".to_string())?;
    let codex_dir = home.join(".codex");
    let session_count = codex_sessions::count_sessions(&home);
    codex_oauth::login(session_count, codex_dir.to_string_lossy().to_string())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn codex_logout() -> Result<(), String> {
    codex_oauth::logout().map_err(|e| e.to_string())
}

#[tauri::command]
async fn codex_connection() -> Result<CodexConnection, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not resolve home directory".to_string())?;
    let codex_dir = home.join(".codex");
    let session_count = codex_sessions::count_sessions(&home);
    codex_oauth::connection(session_count, codex_dir.to_string_lossy().to_string())
        .await
        .map_err(|e| e.to_string())
}

/// Codex provider dashboard. Reads `~/.codex/sessions/**/*.jsonl` +
/// `~/.codex/archived_sessions/*.jsonl`, aggregates token usage by 5h/7d/30d
/// windows + per-model breakdown, and surfaces the latest rate-limit signals
/// embedded in the JSONL itself (no live API call needed for parity).
///
/// `connection.connected` is wired to ccbar's own OAuth keystore by
/// `codex_oauth.rs`; until that lands, this returns `connected: false` so the
/// UI shows the login gate.
#[tauri::command]
async fn get_codex_dashboard() -> Result<CodexDashboardSummary, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not resolve home directory".to_string())?;
    let codex_dir = home.join(".codex");
    let session_count = codex_sessions::count_sessions(&home);

    let codex_dir_str = codex_dir.to_string_lossy().to_string();
    let mut connection = codex_oauth::connection(session_count, codex_dir_str.clone())
        .await
        .unwrap_or(CodexConnection {
            connected: false,
            email: None,
            expires_at: None,
            session_count,
            codex_dir: codex_dir_str.clone(),
            message: None,
        });
    if connection.message.is_none() {
        connection.message = if !codex_dir.exists() {
            Some(
                "~/.codex/ not found. Install Codex CLI/Desktop or use the OpenAI login."
                    .to_string(),
            )
        } else if session_count == 0 {
            Some("No Codex sessions found yet. Run `codex` once to populate.".to_string())
        } else {
            None
        };
    }

    let agg = codex_sessions::read_codex_events(&home).map_err(|e| e.to_string())?;
    let events = &agg.events;
    let now = Utc::now();
    let (today_naive, start_today) = local_today_start_utc();
    let start_7 = now - Duration::days(7);
    let start_30 = now - Duration::days(30);

    let today =
        codex_sessions::summarize_window(events.iter().filter(|e| e.timestamp >= start_today));
    let last_7_days =
        codex_sessions::summarize_window(events.iter().filter(|e| e.timestamp >= start_7));
    let last_30_days =
        codex_sessions::summarize_window(events.iter().filter(|e| e.timestamp >= start_30));
    let all_time = codex_sessions::summarize_window(events.iter());
    let by_model_30d =
        codex_sessions::breakdown_by_model(events.iter().filter(|e| e.timestamp >= start_30));
    let daily_30d = codex_sessions::daily_points(
        events.iter().filter(|e| e.timestamp >= start_30),
        30,
        today_naive,
    );

    let (h5_tokens, h5_cost) = codex_sessions::aggregate_last_5h(events, now);
    let (wk_tokens, wk_cost) = codex_sessions::aggregate_last_7d(events, now);
    let five_hour = build_window_quota(
        agg.rate.primary_status.clone(),
        agg.rate.primary_percent,
        agg.rate.primary_resets_at.clone(),
        h5_tokens.total(),
        h5_cost,
    );
    let weekly = build_window_quota(
        agg.rate.secondary_status.clone(),
        agg.rate.secondary_percent,
        agg.rate.secondary_resets_at.clone(),
        wk_tokens.total(),
        wk_cost,
    );

    let data_since = events
        .iter()
        .map(|e| e.timestamp)
        .min()
        .map(|t| t.with_timezone(&Local).date_naive().format("%Y-%m-%d").to_string());

    Ok(CodexDashboardSummary {
        connection,
        today,
        last_7_days,
        last_30_days,
        all_time,
        by_model_30d,
        daily_30d,
        five_hour,
        weekly,
        data_since,
        plan_type: agg.rate.plan_type,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // Re-launch attempt: focus the existing main window.
            use tauri::Manager;
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .setup(|app| {
            tray::init(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            use tauri::WindowEvent;
            // Main window: hide instead of quit so the app keeps running in the tray.
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
            // Tray popup: hide on focus-lost.
            if window.label() == "tray" {
                if let WindowEvent::Focused(false) = event {
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_dashboard,
            get_login_info,
            get_tray_status,
            get_codex_dashboard,
            get_codex_tray_status,
            codex_login,
            codex_logout,
            codex_connection,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
