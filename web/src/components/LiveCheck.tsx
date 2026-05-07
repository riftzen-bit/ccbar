import { useEffect, useState } from "react";

type OS = "windows" | "macos" | "linux" | "android" | "ios" | "unknown";

interface Detected {
  os: OS;
  osLabel: string;
  arch: string;
  shell: string;
  claudeDir: string;
  binaryPath: string;
  buildPlatformNote: string;
  timezone: string;
}

function detect(): Detected {
  if (typeof navigator === "undefined") {
    return {
      os: "unknown",
      osLabel: "—",
      arch: "—",
      shell: "—",
      claudeDir: "~/.claude",
      binaryPath: "src-tauri/target/release/ccbar",
      buildPlatformNote: "—",
      timezone: "—",
    };
  }

  const ua = navigator.userAgent;
  const uaLow = ua.toLowerCase();
  let os: OS = "unknown";
  if (/windows nt/.test(uaLow)) os = "windows";
  else if (/mac os x|macintosh/.test(uaLow)) os = "macos";
  else if (/android/.test(uaLow)) os = "android";
  else if (/iphone|ipad|ipod/.test(uaLow)) os = "ios";
  else if (/linux/.test(uaLow)) os = "linux";

  // Use UA-CH if available for higher-confidence arch (Chromium only).
  const uaData = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData;
  let arch = "unknown";
  if (/wow64|win64|x64|x86_64/.test(uaLow)) arch = "x86_64";
  else if (/aarch64|arm64/.test(uaLow)) arch = "arm64";
  else if (/armv7|armv8/.test(uaLow)) arch = "arm";
  else if (/i686|x86/.test(uaLow)) arch = "x86";
  if (uaData?.platform === "macOS" && arch === "unknown") arch = "arm64-or-x86_64";

  const tz = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "—"; }
  })();

  const map: Record<OS, Pick<Detected, "osLabel" | "shell" | "claudeDir" | "binaryPath" | "buildPlatformNote">> = {
    windows: {
      osLabel: "Windows",
      shell: "PowerShell or cmd",
      claudeDir: "C:\\Users\\<you>\\.claude",
      binaryPath: "src-tauri\\target\\release\\ccbar.exe",
      buildPlatformNote: "needs Visual C++ Build Tools (MSVC)",
    },
    macos: {
      osLabel: "macOS",
      shell: "zsh",
      claudeDir: "~/.claude",
      binaryPath: "src-tauri/target/release/bundle/macos/ccbar.app",
      buildPlatformNote: "needs Xcode Command Line Tools",
    },
    linux: {
      osLabel: "Linux",
      shell: "bash",
      claudeDir: "~/.claude",
      binaryPath: "src-tauri/target/release/ccbar",
      buildPlatformNote: "needs webkit2gtk-4.1-dev + libssl-dev",
    },
    android: {
      osLabel: "Android",
      shell: "—",
      claudeDir: "—",
      binaryPath: "—",
      buildPlatformNote: "ccbar is a desktop app — no mobile build.",
    },
    ios: {
      osLabel: "iOS",
      shell: "—",
      claudeDir: "—",
      binaryPath: "—",
      buildPlatformNote: "ccbar is a desktop app — no mobile build.",
    },
    unknown: {
      osLabel: "unknown",
      shell: "—",
      claudeDir: "~/.claude",
      binaryPath: "src-tauri/target/release/ccbar",
      buildPlatformNote: "couldn't detect — check your useragent string.",
    },
  };

  return { os, arch, timezone: tz, ...map[os] };
}

type ProbeState = "idle" | "checking" | "running" | "absent";

export default function LiveCheck() {
  const [d, setD] = useState<Detected | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [probe, setProbe] = useState<ProbeState>("idle");

  useEffect(() => {
    setD(detect());
  }, []);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400);
    } catch {
      /* clipboard blocked — silent */
    }
  };

  const ping = async () => {
    setProbe("checking");
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 1500);
    try {
      await fetch("http://localhost:1420/", { mode: "no-cors", signal: ctrl.signal });
      setProbe("running");
    } catch {
      setProbe("absent");
    } finally {
      window.clearTimeout(timer);
    }
  };

  if (!d) {
    return (
      <div className="card-bezel">
        <div className="card-bezel-inner">
          <span className="eyebrow">Live check · your machine</span>
          <p className="mt-3 text-sm text-[var(--color-text-faint)]">detecting…</p>
        </div>
      </div>
    );
  }

  const isMobile = d.os === "android" || d.os === "ios";

  const Row = ({
    label,
    value,
    keyId,
    accent,
  }: {
    label: string;
    value: string;
    keyId: string;
    accent?: boolean;
  }) => (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
        {label}
      </div>
      <div className="mt-2 flex items-stretch gap-2">
        <code
          className={`flex-1 break-all rounded-xl bg-[var(--color-bg-soft)] px-3 py-2.5 font-mono text-[12.5px] ${
            accent ? "text-[var(--color-primary)]" : "text-[var(--color-text)]"
          }`}
        >
          {value}
        </code>
        <button
          onClick={() => copy(value, keyId)}
          className="rounded-xl bg-white px-3 py-2.5 font-mono text-[11px] font-semibold text-[var(--color-text-dim)] shadow-[0_0_0_1px_var(--color-border-strong)] transition hover:bg-[var(--color-primary-soft)] hover:text-[var(--color-primary)]"
        >
          {copied === keyId ? "copied ✓" : "copy"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="card-bezel">
      <div className="card-bezel-inner">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="eyebrow">Live check · your machine</span>
          <span className="text-[11.5px] text-[var(--color-text-faint)]">
            from your browser, not our server
          </span>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 font-mono text-[13px]">
          <div>
            <dt className="text-[10.5px] font-semibold uppercase tracking-widest text-[var(--color-text-faint)]">
              OS
            </dt>
            <dd className="mt-1 text-[var(--color-text)]">{d.osLabel}</dd>
          </div>
          <div>
            <dt className="text-[10.5px] font-semibold uppercase tracking-widest text-[var(--color-text-faint)]">
              Arch
            </dt>
            <dd className="mt-1 text-[var(--color-text)]">{d.arch}</dd>
          </div>
          <div>
            <dt className="text-[10.5px] font-semibold uppercase tracking-widest text-[var(--color-text-faint)]">
              Shell
            </dt>
            <dd className="mt-1 text-[var(--color-text)]">{d.shell}</dd>
          </div>
          <div>
            <dt className="text-[10.5px] font-semibold uppercase tracking-widest text-[var(--color-text-faint)]">
              Timezone
            </dt>
            <dd className="mt-1 text-[var(--color-text)]">{d.timezone}</dd>
          </div>
        </dl>

        {isMobile ? (
          <div className="alert-soft mt-6">
            ccbar is a desktop app, and you're reading this on a phone. Open
            this page on your laptop when you're ready to install.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <Row label="ccbar reads from" value={d.claudeDir} keyId="dir" />
            <Row label="Log in once with" value="claude" keyId="login" accent />
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
                Binary lands at
              </div>
              <div className="mt-2 flex items-stretch gap-2">
                <code className="flex-1 break-all rounded-xl bg-[var(--color-bg-soft)] px-3 py-2.5 font-mono text-[12.5px] text-[var(--color-text)]">
                  {d.binaryPath}
                </code>
                <button
                  onClick={() => copy(d.binaryPath, "bin")}
                  className="rounded-xl bg-white px-3 py-2.5 font-mono text-[11px] font-semibold text-[var(--color-text-dim)] shadow-[0_0_0_1px_var(--color-border-strong)] transition hover:bg-[var(--color-primary-soft)] hover:text-[var(--color-primary)]"
                >
                  {copied === "bin" ? "copied ✓" : "copy"}
                </button>
              </div>
              <p className="mt-2 text-[11.5px] text-[var(--color-text-faint)]">
                {d.buildPlatformNote}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--color-border)] pt-5">
              <button
                onClick={ping}
                disabled={probe === "checking"}
                className="btn-secondary !py-2 !px-4 !text-[12.5px] disabled:opacity-50"
              >
                {probe === "checking" ? "Pinging…" : "Ping localhost:1420"}
              </button>
              {probe === "running" && (
                <span className="pill-chip !bg-emerald-50 !text-emerald-700">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  ccbar dev is running
                </span>
              )}
              {probe === "absent" && (
                <span className="text-[12.5px] text-[var(--color-text-faint)]">
                  Nothing on :1420 — start with{" "}
                  <code className="rounded bg-[var(--color-bg-soft)] px-1.5 py-0.5 text-[12px] text-[var(--color-text-dim)]">
                    pnpm tauri dev
                  </code>
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
