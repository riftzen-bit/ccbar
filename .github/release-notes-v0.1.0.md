# ccbar v0.1.0 — Initial public pre-release

A local-first desktop meter for **Claude Code CLI** and **Codex CLI** usage. Reads your token usage, cost, and quota status directly from `~/.claude/` and `~/.codex/` on your machine. No telemetry, no proxy.

> Status: **v0 / pre-release**. APIs, schemas, and config paths can still shift.

## Highlights

- **Provider tabs** — Claude (Anthropic) and Codex (OpenAI) accounts in one window.
- **Today / 7-day / 30-day** token totals with cost estimates from current list prices.
- **Per-model breakdown** with separate accounting for `input` / `cache_read` / `cache_write` / `output` tokens.
- **Quota windows** — 5-hour and weekly / 7-day rate-limit status from real headers, with a graceful local-token fallback.
- **System tray popup** — left-click toggles a 340×280 quick view; right-click shows Open / Quit.
- **Codex OAuth** — PKCE flow stores tokens encrypted-at-rest in the OS config dir, never persisted to the renderer.

## Install

### Windows
Download `ccbar_0.1.0_x64-setup.exe` (NSIS installer) or `ccbar_0.1.0_x64_en-US.msi` (MSI installer).

The build is **unsigned** — Windows SmartScreen will show "Windows protected your PC". Click **More info** → **Run anyway**.

### macOS (universal)
Download `ccbar_0.1.0_universal.dmg`. Unsigned — first launch needs a right-click → Open to bypass Gatekeeper.

### Linux (x64)
Download `ccbar_0.1.0_amd64.deb` (Debian/Ubuntu) or `ccbar_0.1.0_amd64.AppImage` (any distro).

### From source
See [README](https://github.com/riftzen-bit/ccbar/blob/main/README.md#build-from-source).

## What it reads

- `~/.claude/usage.jsonl` — rate-limit headers when present
- `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl` — assistant messages with `usage` payloads
- `~/.codex/sessions/**/*.jsonl` and `~/.codex/archived_sessions/*.jsonl` — `event_msg.token_count` events including `rate_limits.{primary,secondary}`

There is **one optional network call**: a tiny `/v1/messages` ping (Claude Haiku, `max_tokens=1`, ~$0.000007 per call, cached 60s) so Anthropic returns the live `anthropic-ratelimit-unified-{5h,7d}-*` response headers. Set `CCBAR_LIVE_QUOTA=0` to disable; everything else still works using local data.

ccbar does **not** read `~/.claude/quota-status/sessions/*` or `~/.codex/auth.json`.

## Known limitations

- Windows is the primary tested platform. macOS/Linux builds are produced by GitHub Actions but smoke-tested less rigorously per release.
- OpenAI does not expose a public usage API for ChatGPT Plus / Pro / Codex Pro plans, so Codex live-quota pinging is deferred. Quota numbers come from `rate_limits` already embedded in the local JSONL.
- The `/signup` form on the marketing site is a stub — there is no backend.
- Marketing site screenshots reflect an earlier iteration of the desktop UI; they will be regenerated in the next release.

## Issues / feedback

Please file issues at https://github.com/riftzen-bit/ccbar/issues.

---

Apache License 2.0 · © 2026 riftzen-bit
