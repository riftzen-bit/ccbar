import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const ROUTES = [
  { path: "/", slug: "index" },
  { path: "/privacy", slug: "privacy" },
  { path: "/install", slug: "install" },
  { path: "/signup", slug: "signup" },
  { path: "/login", slug: "login" },
  { path: "/dashboard", slug: "dashboard" },
];

const SHOTS_DIR = path.join(process.cwd(), "tests", "screenshots");
fs.mkdirSync(SHOTS_DIR, { recursive: true });

test.describe("smoke + screenshots", () => {
  for (const route of ROUTES) {
    test(`${route.path} renders + screenshot`, async ({ page }, testInfo) => {
      const errors = [];
      page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
      page.on("console", (msg) => {
        if (msg.type() !== "error") return;
        const text = msg.text();
        // Ignore image 404s — the placeholder is intentional until the user
        // drops a real screenshot at public/screenshots/hero.png.
        if (/screenshots\/hero\.png/.test(text)) return;
        if (/Failed to load resource.*404/.test(text)) return;
        errors.push(`console: ${text}`);
      });
      // Image 404s also fire as request failures.
      page.on("requestfailed", (req) => {
        const url = req.url();
        if (/screenshots\/hero\.png/.test(url)) return;
        errors.push(`requestfailed: ${url} ${req.failure()?.errorText ?? ""}`);
      });

      const response = await page.goto(route.path, { waitUntil: "networkidle" });
      expect(response?.status(), `status code on ${route.path}`).toBe(200);

      // Make sure Caveat font has loaded so screenshots aren't FOUT-y.
      await page.evaluate(async () => {
        if (document.fonts) await document.fonts.ready;
      });
      await page.waitForTimeout(150);

      // Hide any animated blink so screenshots are stable.
      await page.addStyleTag({
        content: `* { animation-duration: 0s !important; transition-duration: 0s !important; }`,
      });

      const projectName = testInfo.project.name;
      const file = path.join(SHOTS_DIR, `${route.slug}.${projectName}.png`);
      await page.screenshot({ path: file, fullPage: true });

      // Sanity assertions per route.
      const html = await page.content();
      expect(html.length, "html length").toBeGreaterThan(500);
      expect(html, "title contains ccbar").toContain("ccbar");

      if (errors.length > 0) {
        console.log(`Errors on ${route.path}:`, errors);
      }
      expect(errors, `console / page errors on ${route.path}`).toEqual([]);
    });
  }
});
