# ccbar-web

Marketing site + future SaaS surface for **ccbar** — a desktop token meter for Claude Code.

The desktop app lives at `D:/Projects/ccbar-claude/`. This repo is the public-facing site.

## v0 (now)

- Static landing built with Astro + Tailwind v4
- 6 pages: `/`, `/privacy`, `/install`, `/signup`, `/login`, `/dashboard`
- No backend, no DB. The signup form is a placeholder.
- Editorial/zine visual language, palette continuous with the desktop app.

## v1 (later)

- Real waitlist endpoint (Cloudflare Worker + Postgres)
- Email auth (magic link or GitHub OAuth)
- Online dashboard that mirrors what the desktop app shows
- Opt-in sync from the desktop app (only aggregates — never conversation text)

## Develop

```bash
pnpm install
pnpm dev          # localhost:4321
pnpm build        # outputs dist/
pnpm preview      # serve the build
```

## Stack

- [Astro 5](https://astro.build) — static site framework
- [Tailwind CSS v4](https://tailwindcss.com) via `@tailwindcss/vite`
- Inter + Caveat + JetBrains Mono via Google Fonts
- TypeScript strict

See `CLAUDE.md` for design conventions and decision log.
