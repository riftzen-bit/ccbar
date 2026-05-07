import { ArrowsClockwise, Terminal } from "@phosphor-icons/react";
import type { LoginInfo } from "../lib/types";

type Props = { login: LoginInfo; onRetry: () => void };

export function LoginGate({ login, onRetry }: Props) {
  return (
    <div className="relative flex h-full items-center justify-center p-8 bg-[var(--color-bg)]">
      <div className="card-bezel relative z-[1] w-full max-w-md">
        <div className="card-bezel-inner">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--color-ink)] text-white">
              <Terminal weight="bold" size={16} />
            </span>
            <div className="eyebrow">ccbar · sign in</div>
          </div>
          <h2 className="display mt-4 text-2xl tracking-tight text-[var(--color-text)]">
            Sign in to Claude Code first
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-dim)]">
            {login.message}
          </p>

          <div className="mt-5 code-inset">
            <div className="text-[10.5px] uppercase tracking-widest text-[var(--pastel-yellow-fg)] opacity-70">
              Run once to log in
            </div>
            <div className="mt-1.5 font-semibold text-[var(--pastel-yellow-fg)]">$ claude</div>
            <div className="mt-3 text-[10.5px] uppercase tracking-widest text-[var(--pastel-yellow-fg)] opacity-70">
              Looking in
            </div>
            <div className="mt-1.5 break-all text-[var(--pastel-yellow-fg)]">{login.claudeDir}</div>
          </div>

          <button
            onClick={onRetry}
            className="btn-primary mt-6 w-full justify-center"
          >
            <ArrowsClockwise weight="bold" size={14} />
            Check again
          </button>
        </div>
      </div>
    </div>
  );
}
