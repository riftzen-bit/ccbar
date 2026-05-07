export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return n.toLocaleString("en-US");
}

export function formatNumberLong(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatUSD(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  if (n >= 10000) return "$" + Math.round(n).toLocaleString("en-US");
  if (n >= 100) return "$" + n.toFixed(0);
  if (n >= 1) return "$" + n.toFixed(2);
  if (n >= 0.01) return "$" + n.toFixed(2);
  return "$" + n.toFixed(4);
}

export function formatShortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  if (!m || !d) return iso;
  return `${m}/${d}`;
}

export function formatRelative(d: Date | null): string {
  if (!d) return "—";
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return d.toLocaleTimeString();
}

/** "resets in 2h41m" if <24h away; otherwise "resets Sun 23:59". */
export function formatResetTime(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const now = Date.now();
  const diff = t - now;
  if (diff <= 0) return "resets shortly";
  if (diff < 24 * 3600_000) {
    const mins = Math.round(diff / 60_000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `resets in ${m}m`;
    return `resets in ${h}h${m.toString().padStart(2, "0")}m`;
  }
  const d = new Date(t);
  const dow = d.toLocaleDateString("en-US", { weekday: "short" });
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `resets ${dow} ${hh}:${mm}`;
}

export type FamilyColors = {
  color: string;
  pastel: { bg: string; fg: string };
};

export type FamilyColorizer = (family: string) => FamilyColors;

export const claudeFamilyColors: FamilyColorizer = (family) => {
  switch (family) {
    case "Opus":
      return { color: "#111111", pastel: { bg: "#E1F3FE", fg: "#1F6C9F" } };
    case "Sonnet":
      return { color: "#787774", pastel: { bg: "#EDF3EC", fg: "#346538" } };
    case "Haiku":
      return { color: "#C4C4C0", pastel: { bg: "#FBF3DB", fg: "#956400" } };
    default:
      return { color: "#A8A29E", pastel: { bg: "#EFEEEA", fg: "#787774" } };
  }
};

export const gptFamilyColors: FamilyColorizer = (family) => {
  switch (family) {
    case "GPT-5":
      return { color: "#111111", pastel: { bg: "#E1F3FE", fg: "#1F6C9F" } };
    case "GPT-5-Codex":
      return { color: "#4A4A48", pastel: { bg: "#EDF3EC", fg: "#346538" } };
    case "GPT-5.5":
      return { color: "#787774", pastel: { bg: "#FBF3DB", fg: "#956400" } };
    case "GPT-4.1":
      return { color: "#C4C4C0", pastel: { bg: "#FDEBEC", fg: "#9F2F2D" } };
    default:
      return { color: "#A8A29E", pastel: { bg: "#EFEEEA", fg: "#787774" } };
  }
};

