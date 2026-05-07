type Tone = "ok" | "warn" | "danger" | "muted";

type Props = {
  /** Raw used percentage 0..100. null → empty rail. */
  percent: number | null;
  /** Provider rate-limit status string, drives color when present. */
  status: string | null;
  /**
   * Display polarity. Default "used" (Claude convention) — bar fills as you
   * consume. "remaining" (Codex CLI convention) — bar empties as you consume,
   * matching how `codex` shows "X% LEFT" in its TUI.
   */
  direction?: "used" | "remaining";
};

function toneFor(
  percent: number | null,
  status: string | null,
  direction: "used" | "remaining",
): Tone {
  if (status === "rejected") return "danger";
  if (status === "allowed_warning") return "warn";
  if (typeof percent === "number") {
    if (direction === "remaining") {
      const remaining = 100 - percent;
      if (remaining <= 10) return "danger";
      if (remaining <= 30) return "warn";
      return "ok";
    }
    if (percent >= 90) return "danger";
    if (percent >= 70) return "warn";
    return "ok";
  }
  return "muted";
}

function fillFor(t: Tone): string {
  switch (t) {
    case "danger":
      return "#9F2F2D";
    case "warn":
      return "#956400";
    case "ok":
      return "#111111";
    case "muted":
    default:
      return "#C4C4C0";
  }
}

export function UsageBar({ percent, status, direction = "used" }: Props) {
  const tone = toneFor(percent, status, direction);
  const fill = fillFor(tone);
  const isEmpty = percent === null;
  // Width represents the bar's filled portion. For "used" semantics that's
  // the consumed slice (grows with usage); for "remaining" semantics that's
  // the available slice (shrinks with usage).
  const usedPct = isEmpty
    ? 0
    : Math.max(0, Math.min(100, percent as number));
  const width = direction === "remaining" ? 100 - usedPct : usedPct;
  return (
    <div
      className="relative h-2 w-full rounded-sm bg-[var(--color-bg-soft)]"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={isEmpty ? undefined : Math.round(width)}
    >
      {!isEmpty && (
        <div
          className="absolute inset-y-0 left-0 rounded-sm transition-[width] duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{ width: `${width}%`, background: fill }}
        />
      )}
    </div>
  );
}
