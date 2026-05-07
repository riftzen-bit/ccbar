// Codex OAuth (PKCE) — login flow ccbar runs itself, separate from any
// `codex login` the user may have done in their terminal. Tokens are persisted
// to ccbar's own keystore, never to ~/.codex/auth.json.
//
// Constants follow the open-source Codex CLI (github.com/openai/codex,
// codex-rs/login/src/auth/manager.rs::CLIENT_ID and
// codex-rs/login/src/server.rs::DEFAULT_ISSUER / DEFAULT_PORT). The CLIENT_ID
// is a public PKCE client; if OpenAI rotates it, this flow will start failing
// — surface that as "session expired, re-login" in the UI.
//
// SECURITY:
// - Access / refresh tokens only exist on disk in `<config>/ccbar/codex-auth.json`
//   (mode 0600 on Unix). They never leave that file or the in-process memory
//   needed to do an HTTPS request. No frontend command returns them.
// - Frontend sees only `CodexConnection { connected, email, expires_at, ... }`.

use anyhow::{anyhow, Context, Result};
use base64::Engine;
use chrono::{DateTime, TimeZone, Utc};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use crate::types::CodexConnection;

const CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const ISSUER: &str = "https://auth.openai.com";
const DEFAULT_PORT: u16 = 1455;
const FALLBACK_PORT: u16 = 1457;
const SCOPE: &str = "openid profile email offline_access";
const CALLBACK_TIMEOUT_SECS: u64 = 300; // 5 minutes for user to complete login

/// Persisted token bundle. Lives only at `<config>/ccbar/codex-auth.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredToken {
    access_token: String,
    refresh_token: Option<String>,
    id_token: Option<String>,
    /// Unix milliseconds.
    expires_at_ms: i64,
    email: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    id_token: Option<String>,
    #[serde(default)]
    expires_in: Option<i64>,
}

fn auth_file_path() -> Result<PathBuf> {
    let base = dirs::config_dir().ok_or_else(|| anyhow!("no config dir"))?;
    Ok(base.join("ccbar").join("codex-auth.json"))
}

fn load_token() -> Result<Option<StoredToken>> {
    let p = auth_file_path()?;
    if !p.exists() {
        return Ok(None);
    }
    let bytes = std::fs::read(&p).context("read codex-auth.json")?;
    let tok: StoredToken = serde_json::from_slice(&bytes).context("parse codex-auth.json")?;
    Ok(Some(tok))
}

fn save_token(tok: &StoredToken) -> Result<()> {
    let p = auth_file_path()?;
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).context("create ccbar config dir")?;
    }
    let json = serde_json::to_vec_pretty(tok)?;
    std::fs::write(&p, json).context("write codex-auth.json")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn delete_token() -> Result<()> {
    let p = auth_file_path()?;
    if p.exists() {
        std::fs::remove_file(&p).context("remove codex-auth.json")?;
    }
    Ok(())
}

fn random_url_safe(num_bytes: usize) -> String {
    let mut buf = vec![0u8; num_bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&buf)
}

fn pkce_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let digest = hasher.finalize();
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest)
}

fn bind_listener() -> Result<TcpListener> {
    if let Ok(l) = TcpListener::bind(("127.0.0.1", DEFAULT_PORT)) {
        return Ok(l);
    }
    if let Ok(l) = TcpListener::bind(("127.0.0.1", FALLBACK_PORT)) {
        return Ok(l);
    }
    Err(anyhow!(
        "Both ports {} and {} are in use. Close other apps using them and retry.",
        DEFAULT_PORT,
        FALLBACK_PORT
    ))
}

fn build_authorize_url(challenge: &str, state: &str, redirect_uri: &str) -> String {
    format!(
        "{ISSUER}/oauth/authorize?response_type=code&client_id={cid}&redirect_uri={ru}&scope={sc}&code_challenge={ch}&code_challenge_method=S256&state={st}&codex_cli_simplified_flow=true&id_token_add_organizations=true",
        cid = urlencoding::encode(CLIENT_ID),
        ru = urlencoding::encode(redirect_uri),
        sc = urlencoding::encode(SCOPE),
        ch = challenge,
        st = state,
    )
}

fn parse_callback_query(raw: &str) -> Option<(String, String)> {
    // Accept "GET /auth/callback?code=...&state=... HTTP/1.1"
    let first_line = raw.lines().next()?;
    let path_and_query = first_line.split_whitespace().nth(1)?;
    let q = path_and_query.split_once('?')?.1;
    let mut code = None;
    let mut state = None;
    for pair in q.split('&') {
        let (k, v) = pair.split_once('=')?;
        match k {
            "code" => code = Some(urldecode(v)),
            "state" => state = Some(urldecode(v)),
            _ => {}
        }
    }
    Some((code?, state?))
}

fn urldecode(s: &str) -> String {
    urlencoding::decode(s).map(|c| c.into_owned()).unwrap_or_else(|_| s.to_string())
}

fn wait_for_callback(listener: TcpListener) -> Result<(String, String)> {
    listener
        .set_nonblocking(false)
        .ok();
    let deadline = Instant::now() + Duration::from_secs(CALLBACK_TIMEOUT_SECS);
    listener
        .set_nonblocking(true)
        .context("set listener nonblocking")?;
    loop {
        if Instant::now() >= deadline {
            return Err(anyhow!("Login timed out — the browser flow took too long."));
        }
        match listener.accept() {
            Ok((mut stream, _addr)) => {
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .ok();
                let mut buf = [0u8; 8192];
                let n = stream.read(&mut buf).unwrap_or(0);
                let req = String::from_utf8_lossy(&buf[..n]).to_string();
                let parsed = parse_callback_query(&req);
                let body = match &parsed {
                    Some(_) => "<!doctype html><meta charset=utf-8><title>ccbar</title><style>body{font-family:-apple-system,Segoe UI,sans-serif;background:#f7f6f3;color:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}div{max-width:380px;padding:32px;border:1px solid #eaeaea;border-radius:12px;background:#fff;text-align:center}h1{font-size:18px;margin:0 0 8px}p{font-size:14px;color:#787774;margin:0}</style><div><h1>You're connected.</h1><p>You can close this window and return to ccbar.</p></div>",
                    None => "<!doctype html><meta charset=utf-8><title>ccbar</title><div style='font-family:sans-serif;padding:24px'>Missing code/state — try again from ccbar.</div>",
                };
                let _ = stream.write_all(
                    format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        body.len(),
                        body
                    )
                    .as_bytes(),
                );
                let _ = stream.flush();
                if let Some(pair) = parsed {
                    return Ok(pair);
                }
                // Otherwise loop and accept the next request.
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(120));
            }
            Err(e) => return Err(anyhow!("listener accept failed: {e}")),
        }
    }
}

async fn exchange_code(
    code: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<TokenResponse> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()?;
    let resp = client
        .post(format!("{ISSUER}/oauth/token"))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(format!(
            "grant_type=authorization_code&client_id={cid}&code={code}&code_verifier={ver}&redirect_uri={ru}",
            cid = urlencoding::encode(CLIENT_ID),
            code = urlencoding::encode(code),
            ver = urlencoding::encode(verifier),
            ru = urlencoding::encode(redirect_uri),
        ))
        .send()
        .await
        .context("token exchange request failed")?;
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(anyhow!("token exchange returned {status}: {body}"));
    }
    let parsed: TokenResponse =
        serde_json::from_str(&body).with_context(|| format!("parse token response: {body}"))?;
    Ok(parsed)
}

async fn refresh_access_token(refresh_token: &str) -> Result<TokenResponse> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()?;
    let resp = client
        .post(format!("{ISSUER}/oauth/token"))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(format!(
            "grant_type=refresh_token&client_id={cid}&refresh_token={rt}&scope={sc}",
            cid = urlencoding::encode(CLIENT_ID),
            rt = urlencoding::encode(refresh_token),
            sc = urlencoding::encode(SCOPE),
        ))
        .send()
        .await
        .context("refresh request failed")?;
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(anyhow!("refresh returned {status}: {body}"));
    }
    let parsed: TokenResponse =
        serde_json::from_str(&body).with_context(|| format!("parse refresh response: {body}"))?;
    Ok(parsed)
}

fn decode_email_from_id_token(id_token: &str) -> Option<String> {
    // JWT: header.payload.signature — we just want the email claim from payload.
    let payload_b64 = id_token.split('.').nth(1)?;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload_b64)
        .ok()?;
    let v: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    v.get("email").and_then(|s| s.as_str()).map(String::from)
}

fn token_to_stored(t: TokenResponse, prev_refresh: Option<String>) -> StoredToken {
    let now_ms = Utc::now().timestamp_millis();
    let expires_at_ms = match t.expires_in {
        Some(s) => now_ms + s * 1000,
        None => now_ms + 3600 * 1000,
    };
    let email = t.id_token.as_deref().and_then(decode_email_from_id_token);
    StoredToken {
        access_token: t.access_token,
        refresh_token: t.refresh_token.or(prev_refresh),
        id_token: t.id_token,
        expires_at_ms,
        email,
    }
}

fn stored_to_connection(tok: &StoredToken, session_count: u64, codex_dir: String) -> CodexConnection {
    let expires_at = Utc
        .timestamp_millis_opt(tok.expires_at_ms)
        .single()
        .map(|d: DateTime<Utc>| d.to_rfc3339());
    let message = if session_count == 0 {
        Some("No Codex sessions found yet. Run `codex` once to populate the dashboard.".to_string())
    } else {
        None
    };
    CodexConnection {
        connected: true,
        email: tok.email.clone(),
        expires_at,
        session_count,
        codex_dir,
        message,
    }
}

/// Public: kick off the login flow. Blocks (async-ly) until the user completes
/// the browser flow OR the listener times out. Returns the final connection
/// state.
pub async fn login(session_count: u64, codex_dir: String) -> Result<CodexConnection> {
    let verifier = random_url_safe(48);
    let challenge = pkce_challenge(&verifier);
    let state = random_url_safe(24);

    let listener = bind_listener()?;
    let port = listener.local_addr()?.port();
    let redirect_uri = format!("http://localhost:{port}/auth/callback");
    let auth_url = build_authorize_url(&challenge, &state, &redirect_uri);

    // Open the browser. If this fails the user can still copy the URL —
    // surface the URL in the error so they can paste it manually.
    if let Err(e) = webbrowser::open(&auth_url) {
        return Err(anyhow!(
            "Could not open browser ({e}). Copy this URL into a browser to continue:\n{auth_url}"
        ));
    }

    // Wait for callback on a blocking task — listener::accept is sync.
    let (code, returned_state) = tokio::task::spawn_blocking(move || wait_for_callback(listener))
        .await
        .map_err(|e| anyhow!("listener task panicked: {e}"))??;
    if returned_state != state {
        return Err(anyhow!("OAuth state mismatch — possible CSRF, aborting."));
    }

    let token = exchange_code(&code, &verifier, &redirect_uri).await?;
    let stored = token_to_stored(token, None);
    save_token(&stored)?;
    Ok(stored_to_connection(&stored, session_count, codex_dir))
}

pub fn logout() -> Result<()> {
    delete_token()
}

/// Read the stored token, refresh if it's near expiry, and surface the
/// connection state. Returns `connected: false` when no token exists.
pub async fn connection(session_count: u64, codex_dir: String) -> Result<CodexConnection> {
    let Some(mut tok) = load_token()? else {
        return Ok(CodexConnection {
            connected: false,
            email: None,
            expires_at: None,
            session_count,
            codex_dir,
            message: None,
        });
    };
    let now_ms = Utc::now().timestamp_millis();
    let near_expiry = tok.expires_at_ms - now_ms < 60_000; // refresh within 60s of expiry
    if near_expiry {
        if let Some(rt) = tok.refresh_token.clone() {
            match refresh_access_token(&rt).await {
                Ok(t) => {
                    tok = token_to_stored(t, Some(rt));
                    let _ = save_token(&tok);
                }
                Err(_) => {
                    // Refresh failed — surface as "session expired" by deleting the
                    // stale file so the next login() actually re-runs the flow.
                    let _ = delete_token();
                    return Ok(CodexConnection {
                        connected: false,
                        email: None,
                        expires_at: None,
                        session_count,
                        codex_dir,
                        message: Some("Session expired — please log in again.".to_string()),
                    });
                }
            }
        }
    }
    Ok(stored_to_connection(&tok, session_count, codex_dir))
}

/// Return the current bearer token suitable for an Authorization header,
/// refreshing it if near expiry. Caller must NOT log or expose it.
#[allow(dead_code)]
pub async fn access_token() -> Result<Option<String>> {
    let Some(mut tok) = load_token()? else {
        return Ok(None);
    };
    let now_ms = Utc::now().timestamp_millis();
    if tok.expires_at_ms - now_ms < 60_000 {
        if let Some(rt) = tok.refresh_token.clone() {
            if let Ok(t) = refresh_access_token(&rt).await {
                tok = token_to_stored(t, Some(rt));
                let _ = save_token(&tok);
            } else {
                return Ok(None);
            }
        } else {
            return Ok(None);
        }
    }
    Ok(Some(tok.access_token))
}
