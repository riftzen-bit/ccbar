import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Lightning, Calendar } from "@phosphor-icons/react";
import { getCodexTrayStatus, getTrayStatus, quitApp } from "./lib/api";
import type {
  CodexTrayStatus,
  TrayStatus,
  WindowQuota,
} from "./lib/types";
import { formatNumber, formatResetTime, formatUSD } from "./lib/format";
import { UsageBar } from "./components/UsageBar";
import { QuotaPill } from "./components/QuotaPill";
import { claudeQuotaPillProps, codexQuotaPillProps } from "./lib/quotaPill";

const POLL_MS = 30_000;
const PROVIDER_KEY = "ccbar.tray.provider";

type Provider = "claude" | "codex";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function readProvider(): Provider {
  if (typeof window === "undefined") return "claude";
  const v = window.localStorage.getItem(PROVIDER_KEY);
  return v === "codex" ? "codex" : "claude";
}

export default function TrayPopup() {
  const [provider, setProvider] = useState<Provider>(readProvider);
  const [claude, setClaude] = useState<TrayStatus | null>(null);
  const [codex, setCodex] = useState<CodexTrayStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  const onProviderChange = useCallback((next: Provider) => {
    setProvider(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PROVIDER_KEY, next);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      // Both providers in parallel — small payloads.
      const [c, x] = await Promise.all([
        getTrayStatus().catch((e) => {
          throw e;
        }),
        getCodexTrayStatus().catch(() => null), // codex may fail (no OAuth) — degrade gracefully
      ]);
      setClaude(c);
      setCodex(x);
      setError(null);
    } catch (e: unknown) {
      setError(typeof e === "string" ? e : (e as Error)?.message ?? String(e));
    }
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = window.setInterval(load, POLL_MS);
    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    };
  }, [load]);

  const onOpenDashboard = useCallback(async () => {
    if (!isTauri()) return;
    const { getCurrentWebviewWindow, getAllWebviewWindows } = await import(
      "@tauri-apps/api/webviewWindow"
    );
    const me = getCurrentWebviewWindow();
    await me.hide();
    const all = await getAllWebviewWindows();
    const main = all.find((w) => w.label === "main");
    if (main) {
      await main.show();
      await main.unminimize();
      await main.setFocus();
    }
  }, []);

  const onQuit = useCallback(async () => {
    if (!isTauri()) {
      window.close();
      return;
    }
    await quitApp();
  }, []);

  if (error && !claude && !codex) {
    return (
      <Frame>
        <div className="text-[11px] text-[var(--color-danger)]">tray error: {error}</div>
      </Frame>
    );
  }

  const data = provider === "claude" ? claude : codex;
  if (!data) {
    return (
      <Frame>
        <Header
          provider={provider}
          onProviderChange={onProviderChange}
          claude={claude}
          codex={codex}
        />
        <div className="mt-2 text-[11px] text-[var(--color-text-faint)]">
          reading {provider === "claude" ? "~/.claude" : "~/.codex"}…
        </div>
      </Frame>
    );
  }

  // Claude not logged in → mini gate.
  if (provider === "claude") {
    const c = claude!;
    if (!c.login.loggedIn) {
      return (
        <Frame>
          <Header
            provider={provider}
            onProviderChange={onProviderChange}
            claude={claude}
            codex={codex}
          />
          <div className="mt-2.5 display text-[14px] text-[var(--color-text)]">
            Sign in to Claude Code
          </div>
          <p className="mt-1 text-[11px] leading-snug text-[var(--color-text-dim)]">
            Run <code className="rounded bg-[var(--pastel-yellow-bg)] px-1 py-0.5 font-mono text-[10px] text-[var(--pastel-yellow-fg)]">claude</code>{" "}
            in a terminal once.
          </p>
          <Footer onOpen={onOpenDashboard} onQuit={onQuit} />
        </Frame>
      );
    }
    return (
      <Frame>
        <Header
          provider={provider}
          onProviderChange={onProviderChange}
          claude={claude}
          codex={codex}
        />
        <div className="mt-2.5">
          <Window
            label="5h window"
            icon={<Lightning size={11} weight="fill" />}
            data={c.fiveHour}
          />
          <div className="mt-2.5" />
          <Window
            label="weekly"
            icon={<Calendar size={11} weight="fill" />}
            data={c.weekly}
          />
        </div>
        <Footer onOpen={onOpenDashboard} onQuit={onQuit} />
      </Frame>
    );
  }

  // Codex view
  const x = codex!;
  if (!x.connection.connected) {
    return (
      <Frame>
        <Header
          provider={provider}
          onProviderChange={onProviderChange}
          claude={claude}
          codex={codex}
        />
        <div className="mt-2.5 display text-[14px] text-[var(--color-text)]">
          Connect OpenAI
        </div>
        <p className="mt-1 text-[11px] leading-snug text-[var(--color-text-dim)]">
          Open the dashboard and sign in on the Codex tab.
        </p>
        <Footer onOpen={onOpenDashboard} onQuit={onQuit} />
      </Frame>
    );
  }
  return (
    <Frame>
      <Header
        provider={provider}
        onProviderChange={onProviderChange}
        claude={claude}
        codex={codex}
      />
      <div className="mt-2.5">
        <Window
          label="5h window"
          icon={<Lightning size={11} weight="fill" />}
          data={x.fiveHour}
          direction="remaining"
          resetSemantics="rolling"
        />
        <div className="mt-2.5" />
        <Window
          label="7-day"
          icon={<Calendar size={11} weight="fill" />}
          data={x.weekly}
          direction="remaining"
          resetSemantics="rolling"
        />
      </div>
      <Footer onOpen={onOpenDashboard} onQuit={onQuit} />
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen w-screen p-2">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
        className="flex h-full w-full flex-col rounded-xl bg-white px-3 py-2.5"
        style={{
          boxShadow: "0 0 0 1px #EAEAEA, 0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}

function Header({
  provider,
  onProviderChange,
  claude,
  codex,
}: {
  provider: Provider;
  onProviderChange: (p: Provider) => void;
  claude: TrayStatus | null;
  codex: CodexTrayStatus | null;
}) {
  const pillProps =
    provider === "claude"
      ? claudeQuotaPillProps(claude?.quota ?? null)
      : codexQuotaPillProps(codex?.fiveHour ?? null, codex?.planType ?? null);
  return (
    <div className="border-b border-[var(--color-border)] pb-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="display text-[12.5px] tracking-tight text-[var(--color-text)]">
            ccbar
          </span>
          <span
            className="live-dot inline-block h-1.5 w-1.5 rounded-full text-[var(--color-live)]"
            style={{ background: "currentColor" }}
          />
        </div>
        <QuotaPill {...pillProps} />
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-[10.5px]">
        <ProviderTab
          label="Claude"
          active={provider === "claude"}
          onClick={() => onProviderChange("claude")}
        />
        <ProviderTab
          label="Codex"
          active={provider === "codex"}
          onClick={() => onProviderChange("codex")}
        />
      </div>
    </div>
  );
}

function ProviderTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative -mb-px py-0.5 transition-colors ${
        active
          ? "font-semibold text-[var(--color-ink)]"
          : "font-medium text-[var(--color-text-dim)] hover:text-[var(--color-ink)]"
      }`}
    >
      {label}
      <span
        aria-hidden
        className={`pointer-events-none absolute -bottom-[3px] left-0 right-0 h-[1.5px] transition-opacity ${
          active ? "opacity-100" : "opacity-0"
        }`}
        style={{ background: "var(--color-ink)" }}
      />
    </button>
  );
}

function Window({
  label,
  icon,
  data,
  direction = "used",
  resetSemantics = "hard",
}: {
  label: string;
  icon: React.ReactNode;
  data: WindowQuota | null;
  /**
   * "used" (Claude) — bar fills as you consume, label "X% used".
   * "remaining" (Codex) — bar empties as you consume, label "Y% left",
   * matching Codex CLI's TUI convention.
   */
  direction?: "used" | "remaining";
  /**
   * "hard" (Claude) — bucket flips back to 0% at a fixed time. Show countdown.
   * "rolling" (Codex) — sliding window; headroom returns continuously as old
   * usage ages out. There is no fixed reset moment, so showing
   * `formatResetTime(resetsAt)` is misleading.
   */
  resetSemantics?: "hard" | "rolling";
}) {
  const empty = !data;
  const percent = data?.percentUsed ?? null;
  const status = data?.status ?? null;
  const tokens = data?.tokensUsed ?? 0;
  const cost = data?.costUsedUsd ?? 0;
  const reset =
    resetSemantics === "rolling"
      ? "rolling"
      : data?.resetsAt
        ? formatResetTime(data.resetsAt)
        : "";
  const displayPct =
    percent === null
      ? null
      : direction === "remaining"
        ? Math.max(0, 100 - percent)
        : percent;
  const suffix = direction === "remaining" ? "left" : "used";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="flex items-center gap-1 num text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-dim)]">
          <span className="text-[var(--color-ink)]">{icon}</span>
          {label}
        </span>
        <span className="num text-[10.5px] tabular-nums text-[var(--color-text)]">
          {displayPct === null ? (
            <span className="text-[var(--color-text-faint)]">—</span>
          ) : (
            <>
              <span className="font-semibold text-[var(--color-ink)]">
                {displayPct.toFixed(0)}%
              </span>
              <span className="ml-1 text-[var(--color-text-faint)]">{suffix}</span>
            </>
          )}
        </span>
      </div>
      <div className="mt-1.5">
        <UsageBar percent={percent} status={status} direction={direction} />
      </div>
      <div className="mt-1.5 flex items-baseline justify-between num text-[10px] text-[var(--color-text-dim)]">
        <span>
          {tokens > 0 ? formatNumber(tokens) : "—"} tokens
          {cost > 0 && (
            <>
              {" · "}
              <span className="font-semibold text-[var(--color-ink)]">
                {formatUSD(cost)}
              </span>
            </>
          )}
        </span>
        <span className="text-[var(--color-text-faint)]">
          {empty || percent === null ? "no live data" : reset}
        </span>
      </div>
    </div>
  );
}

function Footer({ onOpen, onQuit }: { onOpen: () => void; onQuit: () => void }) {
  return (
    <div className="mt-auto flex items-center justify-between border-t border-[var(--color-border)] pt-2">
      <button
        onClick={onOpen}
        className="text-[11px] font-semibold text-[var(--color-ink)] transition hover:text-black"
      >
        Open dashboard →
      </button>
      <button
        onClick={onQuit}
        className="text-[11px] font-medium text-[var(--color-text-faint)] transition hover:text-[var(--color-danger)]"
      >
        Quit
      </button>
    </div>
  );
}
