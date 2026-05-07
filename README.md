# ccbar — Claude Code Bar

A local-first desktop meter for **Claude Code CLI** and **Codex CLI** usage. Reads your token usage, cost, and quota status directly from `~/.claude/` and `~/.codex/` on your machine — no cloud, no proxy, no telemetry.

> Status: **v0 / pre-release**. APIs, schemas, and config paths can still shift.

## What it does

- **Provider tabs** — switch between Claude (Anthropic) and Codex (OpenAI) accounts in one window.
- **Today / 7-day / 30-day token totals** with cost estimates derived from current published list prices.
- **Per-model breakdown** with cache-hit accounting (`input` / `cache_read` / `cache_write` / `output` totals separated, since cache reads are cheaper and cache writes are more expensive).
- **Quota windows** — 5-hour and weekly / 7-day rate-limit status pulled from real headers when available, with a graceful local-token fallback.
- **System tray popup** — left-click the tray icon for a 340×280 quick view; right-click for Open / Quit.
- **Login gate** — detects whether each provider's CLI has been used at least once, and surfaces an OAuth flow for Codex when needed.

## How it gets data

ccbar reads files **on your disk** that the official CLIs already write:

- **Claude**: `~/.claude/usage.jsonl` (rate-limit headers when present) and `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl` (assistant messages with detailed `usage` payloads).
- **Codex**: `~/.codex/sessions/**/*.jsonl` and `~/.codex/archived_sessions/*.jsonl` (`event_msg.token_count` events, including `rate_limits.{primary,secondary}`).

There is **one optional network call**: a tiny `/v1/messages` ping (Claude Haiku, `max_tokens=1`, ~$0.000007 per call, cached 60s) so Anthropic returns the live `anthropic-ratelimit-unified-{5h,7d}-*` response headers. Set `CCBAR_LIVE_QUOTA=0` to disable it; everything else still works using local data.

ccbar does **not**:

- Call any usage / billing API,
- Read `~/.claude/quota-status/sessions/*` or `~/.codex/auth.json`,
- Send your token / data anywhere except the optional Anthropic ping above,
- Persist your credentials. The Claude OAuth token is held in memory only for the lifetime of a single HTTPS request and is never logged or emitted over Tauri events. Codex OAuth tokens (issued by ccbar's own PKCE flow) are stored encrypted-at-rest by the OS via your Tauri app config dir.

## Stack

- **App shell**: Tauri 2 (Rust backend + WebView frontend)
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Recharts, Phosphor Icons, Framer Motion
- **Backend**: Rust (`serde`, `serde_json`, `walkdir`, `chrono`, `dirs`, `anyhow`, `reqwest` with `rustls-tls`, `tokio`)
- **Marketing site** (`web/`): Astro 5 + Tailwind v4

## Build from source

Requires:

- Node.js 20+ and pnpm 9+
- Rust 1.80+ (`rustup default stable`)
- Platform-specific Tauri prerequisites (see [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)). On Windows you need the Visual C++ Build Tools.

```bash
git clone https://github.com/riftzen-bit/ccbar
cd ccbar
pnpm install

# Run the app (frontend dev server + Tauri shell)
pnpm tauri dev

# Or production build:
pnpm tauri build
```

Other scripts:

```bash
pnpm dev          # Vite-only frontend dev (no Tauri shell)
pnpm dev:mock     # Vite + mocked backend (fixture data, useful for design iteration)
pnpm build        # tsc + vite build (frontend type-check + bundle)

cd src-tauri
cargo check       # Rust type-check
cargo test        # Rust test suite
```

The marketing site lives in `web/`:

```bash
pnpm web:dev      # Astro dev server at http://localhost:4321/
pnpm web:build    # static build
pnpm web:capture  # regenerate app screenshots into web/public/screenshots/
pnpm web:test     # Playwright visual-regression smoke
```

## Privacy

- All usage data stays on your machine.
- No analytics. No telemetry. No remote logging. No silent uploads.
- The opt-in Anthropic ping (above) carries an OAuth token over HTTPS; it is not stored, logged, or passed to the renderer.
- Codex OAuth flow uses the public PKCE client ID `app_EMoamEEZ73f0CkXaXp7hrann` published by the open-source Codex CLI — there is no separate ccbar identifier presented to OpenAI's auth server.

## Limitations

- Frontend tested on Windows; macOS / Linux Tauri builds should work but are not yet smoke-tested per-release.
- OpenAI does not expose a public usage API for ChatGPT Plus / Pro / Codex Pro plans, so Codex live-quota pinging is deferred to a later version. Quota numbers come from `rate_limits` already embedded in the local JSONL.
- The `web/` marketing site form on `/signup` is a stub — there is no backend yet.

## Contributing

Issues and pull requests welcome. Please file an issue before starting on anything large.

## License

[Apache License 2.0](./LICENSE) — see `LICENSE` for full text. Copyright 2026 riftzen-bit.
