import { useState } from "react";
import { OpenAiLogo, SignOut, ArrowsClockwise } from "@phosphor-icons/react";
import type { CodexConnection } from "../lib/types";
import { codexLogin, codexLogout } from "../lib/api";

type Props = {
  connection: CodexConnection;
  onChanged: () => void;
};

export function CodexLoginGate({ connection, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onLogin = async () => {
    setBusy(true);
    setError(null);
    try {
      await codexLogin();
      onChanged();
    } catch (e: any) {
      setError(typeof e === "string" ? e : e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const onLogout = async () => {
    setBusy(true);
    setError(null);
    try {
      await codexLogout();
      onChanged();
    } catch (e: any) {
      setError(typeof e === "string" ? e : e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!connection.connected) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8">
        <div className="card-bezel w-full max-w-md">
          <div className="card-bezel-inner">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--color-ink)] text-white">
                <OpenAiLogo weight="bold" size={16} />
              </span>
              <div className="eyebrow">ccbar · codex</div>
            </div>
            <h2 className="display mt-4 text-2xl tracking-tight text-[var(--color-text)]">
              Connect your OpenAI account
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-dim)]">
              Sign in once with your ChatGPT/Codex account to view your token
              usage and rate-limit windows. Browser opens for the OAuth flow,
              then ccbar reads usage from{" "}
              <code className="font-mono text-[var(--color-text)]">~/.codex/sessions/</code>{" "}
              locally.
            </p>

            <button
              onClick={onLogin}
              disabled={busy}
              className="btn-primary mt-6 w-full justify-center disabled:opacity-50"
            >
              {busy ? (
                <ArrowsClockwise weight="bold" size={14} className="animate-spin" />
              ) : (
                <OpenAiLogo weight="bold" size={14} />
              )}
              {busy ? "Waiting for browser…" : "Continue with OpenAI"}
            </button>

            {error && (
              <pre className="mt-4 overflow-auto code-inset !text-[12px]">{error}</pre>
            )}

            <p className="mt-4 text-[11px] leading-relaxed text-[var(--color-text-faint)]">
              Tokens stay on this machine in <code className="font-mono">{"<config>/ccbar/codex-auth.json"}</code>.
              Nothing is uploaded.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Connected, but no sessions yet.
  return (
    <div className="flex min-h-[40vh] items-center justify-center p-8">
      <div className="card-bezel w-full max-w-md">
        <div className="card-bezel-inner">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--color-ink)] text-white">
                <OpenAiLogo weight="bold" size={16} />
              </span>
              <div className="eyebrow">connected</div>
            </div>
            <button
              onClick={onLogout}
              disabled={busy}
              className="btn-secondary !py-1.5 !px-2.5 !text-[11.5px] disabled:opacity-50"
              title="Disconnect"
            >
              <SignOut weight="bold" size={12} />
              Disconnect
            </button>
          </div>
          <h2 className="display mt-4 text-2xl tracking-tight text-[var(--color-text)]">
            {connection.email ? `Connected as ${connection.email}` : "Connected"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-dim)]">
            {connection.message ??
              "No Codex sessions found yet. Run `codex` once in a terminal to start populating your dashboard."}
          </p>

          <div className="mt-5 code-inset">
            <div className="text-[10.5px] uppercase tracking-widest text-[var(--pastel-yellow-fg)] opacity-70">
              Run once
            </div>
            <div className="mt-1.5 font-semibold text-[var(--pastel-yellow-fg)]">$ codex</div>
            <div className="mt-3 text-[10.5px] uppercase tracking-widest text-[var(--pastel-yellow-fg)] opacity-70">
              Looking in
            </div>
            <div className="mt-1.5 break-all text-[var(--pastel-yellow-fg)]">
              {connection.codexDir}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
