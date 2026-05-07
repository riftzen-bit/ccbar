import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { QuotaPill } from "./components/QuotaPill";
import { ProviderTabs } from "./components/ProviderTabs";
import { BackToTop } from "./components/BackToTop";
import { formatRelative } from "./lib/format";
import type { Provider, ProviderViewHandle } from "./views/types";

const ClaudeDashboard = lazy(() => import("./views/ClaudeDashboard"));
const CodexDashboard = lazy(() => import("./views/CodexDashboard"));

const PROVIDER_KEY = "ccbar.provider";

function readProvider(): Provider {
  if (typeof window === "undefined") return "claude";
  const v = window.localStorage.getItem(PROVIDER_KEY);
  return v === "codex" ? "codex" : "claude";
}

function App() {
  const [provider, setProvider] = useState<Provider>(readProvider);
  const [handle, setHandle] = useState<ProviderViewHandle | null>(null);
  // Tick once a second so "synced 12s ago" stays fresh without re-rendering data.
  const [, force] = useState(0);

  const onProviderChange = useCallback((next: Provider) => {
    setProvider(next);
    setHandle(null);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PROVIDER_KEY, next);
    }
  }, []);

  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative flex min-h-full flex-col bg-[var(--color-bg)]">
      <AppHeader provider={provider} onProviderChange={onProviderChange} handle={handle} />

      <Suspense
        fallback={
          <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--color-text-dim)]">
            loading…
          </div>
        }
      >
        {provider === "claude" ? (
          <ClaudeDashboard onSync={setHandle} />
        ) : (
          <CodexDashboard onSync={setHandle} />
        )}
      </Suspense>

      <div className="mt-auto" />
      <BackToTop />
    </div>
  );
}

function AppHeader({
  provider,
  onProviderChange,
  handle,
}: {
  provider: Provider;
  onProviderChange: (p: Provider) => void;
  handle: ProviderViewHandle | null;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-hairline)] bg-[var(--color-bg)]">
      <div className="flex items-center justify-between px-5 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="display text-[15px] tracking-tight text-[var(--color-text)]">
              ccbar
            </span>
            <span
              className="live-dot inline-block h-1.5 w-1.5 rounded-full text-[var(--color-live)]"
              style={{ background: "currentColor" }}
            />
          </div>
          {handle?.secondary && (
            <>
              <span className="h-3 w-px bg-[var(--color-hairline)]" />
              <span className="num text-[11px] text-[var(--color-text-faint)]">
                {handle.secondary}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {handle?.pill && <QuotaPill {...handle.pill} />}
          <span className="num text-[11px] text-[var(--color-text-faint)]">
            synced {formatRelative(handle?.lastSync ?? null)}
          </span>
          <button
            onClick={() => handle?.onRefresh()}
            disabled={!handle || handle.loading}
            className="group flex items-center gap-1.5 rounded-md border border-[var(--color-hairline)] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[var(--color-ink)] transition-colors duration-200 hover:bg-[var(--color-bg-soft)] hover:border-[var(--color-ink)] disabled:opacity-50"
          >
            <ArrowsClockwise
              weight="bold"
              size={12}
              className={
                handle?.loading
                  ? "animate-spin"
                  : "transition-transform duration-500 group-hover:rotate-90"
              }
            />
            Refresh
          </button>
        </div>
      </div>
      <ProviderTabs active={provider} onChange={onProviderChange} />
    </header>
  );
}

export default App;
