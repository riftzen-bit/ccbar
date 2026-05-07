// Quick diagnostic — opens / on Vite mock, dumps console + errors + body.
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1180, height: 740 } });
const page = await ctx.newPage();
page.on("console", (m) => console.log(`[console.${m.type()}]`, m.text()));
page.on("pageerror", (e) => console.log(`[pageerror]`, e.message));
await page.goto("http://localhost:1420/", { waitUntil: "networkidle" });
await page.waitForTimeout(3500);
const html = await page.evaluate(() => document.body.innerHTML.slice(0, 1500));
console.log("=== body[:1500] ===");
console.log(html);
await browser.close();
