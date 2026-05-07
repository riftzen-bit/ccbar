import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { getDashboard } from "../lib/api";
import type { DashboardSummary } from "../lib/types";
import { Hero } from "../components/Hero";
import { Daily } from "../components/Daily";
import { Models } from "../components/Models";
import { Windows } from "../components/Windows";
import { LoginGate } from "../components/LoginGate";
import { claudeQuotaPillProps } from "../lib/quotaPill";
import type { ProviderViewHandle } from "./types";

const REFRESH_MS = 15_000;

type Props = {
  /** Lift sync state to the shell so the header pill / refresh row reflects this view. */
  onSync?: (handle: ProviderViewHandle) => void;
};

function ClaudeDashboard({ onSync }: Props) {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [, force] = useState(0);
  const initialLoad = useRef(true);

  const load = useCallback(async () => {
    if (initialLoad.current) setLoading(true);
    setError(null);
    try {
      const d = await getDashboard();
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
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Push state up to the shell on every change so the header reflects this tab.
  useEffect(() => {
    if (!onSync) return;
    onSync({
      loading,
      lastSync,
      onRefresh: load,
      pill: data ? claudeQuotaPillProps(data.quota) : null,
      secondary:
        data && data.login.loggedIn
          ? `${data.login.sessionCount.toLocaleString()} sessions`
          : undefined,
    });
  }, [data, loading, lastSync, load, onSync]);

  if (error && !data) return <ErrorView error={error} onRetry={load} />;

  if (!data && loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--color-text-dim)]">
        Reading <code className="mx-1 font-mono text-[var(--color-text)]">~/.claude</code>
      </div>
    );
  }

  if (!data) return null;
  if (!data.login.loggedIn) return <LoginGate login={data.login} onRetry={load} />;

  return (
    <div data-testid="dashboard-loaded">
      <main className="relative z-[1] flex flex-col gap-5 px-5 pb-6 pt-2">
        <Card>
          <Hero today={data.today} trailing={data.daily30d} />
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
          />
        </Card>
        <Card>
          <Models models={data.byModel30d} />
        </Card>
      </main>
      <Footer claudeDir={data.login.claudeDir} />
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="card-bezel">
      <div className="card-bezel-inner !p-0 overflow-hidden">{children}</div>
    </div>
  );
}

function Footer({ claudeDir }: { claudeDir: string }) {
  return (
    <footer className="relative z-[1] flex items-center justify-between px-6 py-4 num text-[10.5px] text-[var(--color-text-faint)]">
      <span>
        <span className="text-[var(--color-text-dim)]">source</span>{" "}
        <code className="text-[var(--color-text-dim)]">{claudeDir}</code>
      </span>
      <span>auto-refresh · {REFRESH_MS / 1000}s</span>
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
            Failed to read usage data
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

export default ClaudeDashboard;
