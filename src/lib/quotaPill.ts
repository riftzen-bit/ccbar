import type { QuotaPillTone } from "../components/QuotaPill";
import type { QuotaStatus, WindowQuota } from "./types";

const STALE_AFTER_MS = 60 * 60 * 1000;

function ageInMs(iso: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Date.now() - t;
}

function formatRelativeAge(ageMs: number | null): string {
  if (ageMs === null) return "";
  const sec = Math.floor(ageMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export type QuotaPillProps = {
  tone: QuotaPillTone;
  primary: string;
  secondary?: string;
  title?: string;
};

/** Translate Claude's `QuotaStatus` → QuotaPill props.
 *  Mirrors the historical behaviour of the old QuotaPill component. */
export function claudeQuotaPillProps(quota: QuotaStatus | null): QuotaPillProps {
  if (!quota || quota.requestsRemaining === null || quota.requestsRemaining === undefined) {
    return { tone: "no-data", primary: "rate-limit", secondary: "n/a" };
  }
  const r = quota.requestsRemaining;
  const ageMs = ageInMs(quota.lastSeenAt);
  const stale = ageMs !== null && ageMs > STALE_AFTER_MS;
  const last = formatRelativeAge(ageMs);

  if (stale) {
    return {
      tone: "stale",
      primary: `${r} req left`,
      secondary: last ? `stale ${last}` : "stale",
      title: `${r} requests remaining (recorded ${quota.lastSeenAt}). usage.jsonl only logs on errors, so this number is stale.`,
    };
  }
  const tone: QuotaPillTone = r > 30 ? "ok" : r > 10 ? "warn" : "critical";
  return {
    tone,
    primary: `${r} req left`,
    secondary: last || undefined,
    title: `${r} requests remaining · last seen ${quota.lastSeenAt}`,
  };
}

/** Translate Codex `WindowQuota` (5h primary) + plan info → QuotaPill props.
 *  Note: Codex JSONL `used_percent` IS percent-used (0 fresh, 100 exhausted),
 *  but Codex CLI/Desktop renders it as "X% LEFT" (= 100 - used_percent). We
 *  match that convention so users see consistent numbers across tools. */
export function codexQuotaPillProps(
  fiveHour: WindowQuota | null,
  planType: string | null,
): QuotaPillProps {
  const planLabel = planType
    ? planType.charAt(0).toUpperCase() + planType.slice(1) + " plan"
    : undefined;
  if (!fiveHour || fiveHour.percentUsed === null || fiveHour.percentUsed === undefined) {
    return {
      tone: "no-data",
      primary: "5h · n/a",
      secondary: planLabel,
      title: "No Codex rate-limit data yet — open Codex CLI/Desktop once to populate.",
    };
  }
  const used = fiveHour.percentUsed;
  const left = Math.max(0, 100 - used);
  const tone: QuotaPillTone =
    fiveHour.status === "rejected" || left <= 10
      ? "critical"
      : fiveHour.status === "allowed_warning" || left <= 30
        ? "warn"
        : "ok";
  return {
    tone,
    primary: `5h · ${left.toFixed(0)}% left`,
    secondary: planLabel,
    title: `Codex 5-hour window: ${left.toFixed(1)}% remaining (${used.toFixed(1)}% used)${planLabel ? ` · ${planLabel}` : ""}`,
  };
}
