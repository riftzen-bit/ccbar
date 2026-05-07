import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowsClockwise, SignOut } from "@phosphor-icons/react";
import { codexLogout, getCodexDashboard } from "../lib/api";
import type { CodexDashboardSummary } from "../lib/types";
import { Hero } from "../components/Hero";
import { Daily } from "../components/Daily";
import { Models } from "../components/Models";
import { Windows } from "../components/Windows";
import { CodexLoginGate } from "../components/CodexLoginGate";
import { gptFamilyColors } from "../lib/format";
import { codexQuotaPillProps } from "../lib/quotaPill";
import type { ProviderViewHandle } from "./types";

const REFRESH_MS = 15_000;
const CODEX_LEGEND = [
  { label: "GPT-5", color: "#111111" },
  { label: "GPT-5-Codex", color: "#4A4A48" },
  { label: "GPT-5.5", color: "#787774" },
  { label: "GPT-4.1", color: "#C4C4C0" },
];

type Props = {
  onSync?: (handle: ProviderViewHandle) => void;
};

function CodexDashboard({ onSync }: Props) {
  const [data, setData] = useState<CodexDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const initialLoad = useRef(true);

  const load = useCallback(async () => {
    if (initialLoad.current) setLoading(true);
    setError(null);
    try {
      const d = await getCodexDashboard();
      setData(d);
      setLastSync(new Date());
    } catch (e: any) {
      setError(typeof e === "string" ? e : e?.message ?? String(e));
    } finally {
      setLoading(false);
      initialLoad.current = false;
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!onSync) return;
    onSync({
      loading,
      lastSync,
      onRefresh: load,
      pill: data ? codexQuotaPillProps(data.fiveHour, data.planType) : null,
      secondary: data?.connection.connected
        ? data.connection.email ?? "connected"
        : undefined,
    });
  }, [data, loading, lastSync, load, onSync]);

  if (error && !data) return <ErrorView error={error} onRetry={load} />;

  if (!data && loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--color-text-dim)]">
        Reading <code className="mx-1 font-mono text-[var(--color-text)]">~/.codex</code>
      </div>
    );
  }

  if (!data) return null;

  // Gate on OAuth connection. When not connected (or connected but no
  // sessions), show the gate card.
  if (!data.connection.connected || data.connection.sessionCount === 0) {
    return <CodexLoginGate connection={data.connection} onChanged={load} />;
  }

  return (
    <div data-testid="codex-dashboard-loaded">
      <main className="relative z-[1] flex flex-col gap-5 px-5 pb-6 pt-2">
        <Card>
          <Hero
            today={data.today}
            trailing={data.daily30d}
            subscriptionLine={
              data.planType
                ? `OpenAI list price · ${
                    data.planType.charAt(0).toUpperCase() + data.planType.slice(1)
                  } plan is a flat subscription`
                : "OpenAI list price · subscription is flat"
            }
          />
        </Card>
        <Card>
          <Daily points={data.daily30d} />
        </Card>
        <Card>
          <Windows
            today={data.today}
            last7Days={data.last7Days}
            last30Days={data.last30Days}
            allTime={data.allTime}
            dataSince={data.dataSince}
            subscriptionMonthlyUsd={planMonthlyUsd(data.planType)}
            subscriptionName={
              data.planType
                ? `Codex ${data.planType.charAt(0).toUpperCase() + data.planType.slice(1)}`
                : "Codex subscription"
            }
          />
        </Card>
        <Card>
          <Models
            models={data.byModel30d}
            colorizer={gptFamilyColors}
            legend={CODEX_LEGEND}
          />
        </Card>
      </main>
      <Footer connection={data.connection} onLogout={load} />
    </div>
  );
}

function planMonthlyUsd(plan: string | null): number | null {
  if (!plan) return null;
  switch (plan.toLowerCase()) {
    case "pro":
      return 200;
    case "plus":
      return 20;
    case "team":
      return 30;
    default:
      return null;
  }
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="card-bezel">
      <div className="card-bezel-inner !p-0 overflow-hidden">{children}</div>
    </div>
  );
}

function Footer({
  connection,
  onLogout,
}: {
  connection: CodexDashboardSummary["connection"];
  onLogout: () => void;
}) {
  const handleLogout = async () => {
    try {
      await codexLogout();
      onLogout();
    } catch {
      // ignored — next refresh will surface the error
    }
  };
  return (
    <footer className="relative z-[1] flex items-center justify-between px-6 py-4 num text-[10.5px] text-[var(--color-text-faint)]">
      <span>
        <span className="text-[var(--color-text-dim)]">source</span>{" "}
        <code className="text-[var(--color-text-dim)]">{connection.codexDir}</code>
      </span>
      <div className="flex items-center gap-3">
        <span>auto-refresh · {REFRESH_MS / 1000}s</span>
        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-1 text-[var(--color-text-dim)] transition hover:text-[var(--pastel-red-fg)]"
          title="Disconnect Codex"
        >
          <SignOut weight="bold" size={11} />
          disconnect
        </button>
      </div>
    </footer>
  );
}

function ErrorView({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center p-8">
      <div className="card-bezel max-w-md">
        <div className="card-bezel-inner">
          <div className="eyebrow !text-[var(--pastel-red-fg)]">error</div>
          <h2 className="display mt-3 text-xl tracking-tight text-[var(--color-text)]">
            Failed to read Codex usage
          </h2>
          <pre className="mt-4 overflow-auto code-inset !text-[12px]">{error}</pre>
          <button onClick={onRetry} className="btn-primary mt-5 w-full justify-center">
            <ArrowsClockwise weight="bold" size={14} />
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}

export default CodexDashboard;
