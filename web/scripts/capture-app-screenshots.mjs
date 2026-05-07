// Capture real screenshots of the ccbar Tauri app's React frontend, with the
// IPC layer mocked. Output goes to web/public/screenshots/. Replaces hand-drop
// placeholders.
//
// Run: `pnpm web:capture` from the repo root.
//
// Pipeline:
//   1. Spawn `pnpm dev:mock` in the repo root (Vite at :1420 with VITE_MOCK_TAURI=1).
//   2. Wait for HTTP 200 from / .
//   3. For each shot, set window.__CCBAR_MOCK_VARIANT__ via addInitScript,
//      navigate, wait for [data-testid="dashboard-loaded"] (or login-gate),
//      then full-page or [data-shot=...] crop.
//   4. Kill Vite, exit.

import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const OUT_DIR = resolve(REPO_ROOT, "web", "public", "screenshots");
const URL_BASE = "http://localhost:1420";
const VIEWPORT = { width: 1180, height: 740 };

const TRAY_VIEWPORT = { width: 360, height: 300 };

const SHOTS = [
  { name: "full", variant: "default", crop: null, viewport: VIEWPORT },
  { name: "hero", variant: "default", crop: '[data-shot="hero"]' },
  { name: "daily", variant: "default", crop: '[data-shot="daily"]' },
  { name: "models", variant: "default", crop: '[data-shot="models"]' },
  { name: "windows", variant: "default", crop: '[data-shot="windows"]' },
  { name: "quota-good", variant: "default", crop: '[data-shot="quota"]' },
  { name: "quota-low", variant: "quotaLow", crop: '[data-shot="quota"]' },
  { name: "quota-stale", variant: "quotaStale", crop: '[data-shot="quota"]' },
  {
    name: "login-gate",
    variant: "notLoggedIn",
    crop: null,
    viewport: VIEWPORT,
    waitFor: "text=Sign in to Claude Code first",
  },
  // Tray popup variants — `?label=tray` forces the TrayPopup tree on the
  // mock Vite server, `?variant=...` picks the fixture.
  {
    name: "tray-fresh",
    variant: "trayFresh",
    crop: null,
    viewport: TRAY_VIEWPORT,
    query: "label=tray&variant=trayFresh",
    waitFor: "text=5h window",
  },
  {
    name: "tray-empty",
    variant: "trayEmpty",
    crop: null,
    viewport: TRAY_VIEWPORT,
    query: "label=tray&variant=trayEmpty",
    waitFor: "text=no live data",
  },
  {
    name: "tray-critical",
    variant: "trayCritical",
    crop: null,
    viewport: TRAY_VIEWPORT,
    query: "label=tray&variant=trayCritical",
    waitFor: "text=5h window",
  },
];

async function waitForServer(timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(URL_BASE);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Vite did not come up at ${URL_BASE} within ${timeoutMs}ms`);
}

async function capture() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`[capture] spawning vite (cwd=${REPO_ROOT})`);
  const vite = spawn("pnpm", ["dev:mock"], {
    cwd: REPO_ROOT,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  vite.stdout.on("data", (d) => process.stdout.write(`[vite] ${d}`));
  vite.stderr.on("data", (d) => process.stderr.write(`[vite!] ${d}`));

  let viteExited = false;
  vite.on("exit", (code) => {
    viteExited = true;
    console.log(`[capture] vite exited code=${code}`);
  });

  const cleanup = () => {
    if (!viteExited) {
      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/PID", String(vite.pid), "/T", "/F"], {
            shell: true,
            stdio: "ignore",
          });
        } else {
          vite.kill("SIGTERM");
        }
      } catch (e) {
        console.error("[capture] cleanup failed:", e);
      }
    }
  };

  let exitCode = 0;
  try {
    await waitForServer();
    console.log(`[capture] vite ready, launching chromium`);

    const browser = await chromium.launch();

    // Pre-warm Vite — first request triggers optimize-deps + reload. Eat
    // that here so per-shot navigation is stable. Hit BOTH the main label
    // (loads dashboard chunk) and the tray label (loads popup chunk).
    {
      const ctx = await browser.newContext({ viewport: VIEWPORT });
      const page = await ctx.newPage();
      await page.goto(URL_BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      await page.goto(`${URL_BASE}/?label=tray&variant=trayFresh`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      await ctx.close();
      console.log(`[capture] vite pre-warmed`);
    }

    for (const shot of SHOTS) {
      const ctx = await browser.newContext({
        viewport: shot.viewport ?? VIEWPORT,
        deviceScaleFactor: 2,
      });
      await ctx.addInitScript(
        (variant) => {
          window.__CCBAR_MOCK_VARIANT__ = variant;
        },
        shot.variant,
      );
      const page = await ctx.newPage();
      const url = shot.query ? `${URL_BASE}/?${shot.query}` : URL_BASE;
      await page.goto(url, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);

      if (shot.waitFor) {
        await page.waitForSelector(shot.waitFor, { timeout: 20_000 });
      } else {
        await page.waitForSelector('[data-testid="dashboard-loaded"]', {
          timeout: 20_000,
        });
      }
      await page.waitForTimeout(700); // settle Recharts + Caveat
      await page.evaluate(() => {
        const live = document.querySelector(".live-dot");
        if (live) live.style.animation = "none";
      });

      const out = resolve(OUT_DIR, `${shot.name}.png`);
      if (shot.crop) {
        const el = await page.$(shot.crop);
        if (!el) throw new Error(`Selector "${shot.crop}" not found for ${shot.name}`);
        await el.screenshot({ path: out, omitBackground: false });
      } else {
        await page.screenshot({
          path: out,
          fullPage: false,
          omitBackground: false,
        });
      }
      console.log(`[capture] wrote ${out}`);

      await ctx.close();
    }

    await browser.close();
    console.log(`[capture] done — ${SHOTS.length} screenshots in ${OUT_DIR}`);
  } catch (e) {
    console.error("[capture] FAILED:", e);
    exitCode = 1;
  } finally {
    cleanup();
    // Give kill a moment, then exit
    await new Promise((r) => setTimeout(r, 500));
    process.exit(exitCode);
  }
}

capture();
