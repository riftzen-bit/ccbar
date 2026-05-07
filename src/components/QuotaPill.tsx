export type QuotaPillTone = "ok" | "warn" | "critical" | "stale" | "no-data";

type Props = {
  tone: QuotaPillTone;
  primary: string;
  secondary?: string;
  title?: string;
};

const TONE_STYLES: Record<QuotaPillTone, { dot: string; text: string }> = {
  ok: { dot: "var(--pastel-green-fg)", text: "text-[var(--pastel-green-fg)]" },
  warn: { dot: "var(--pastel-yellow-fg)", text: "text-[var(--pastel-yellow-fg)]" },
  critical: { dot: "var(--pastel-red-fg)", text: "text-[var(--pastel-red-fg)]" },
  stale: { dot: "var(--color-text-faint)", text: "text-[var(--color-text-faint)]" },
  "no-data": { dot: "var(--color-text-faint)", text: "text-[var(--color-text-faint)]" },
};

export function QuotaPill({ tone, primary, secondary, title }: Props) {
  const t = TONE_STYLES[tone];
  return (
    <span
      className={`pill-chip ${t.text}`}
      title={title}
      data-shot="quota"
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: t.dot }}
      />
      <span className={`num text-[11.5px] ${tone === "stale" || tone === "no-data" ? "" : "font-semibold"}`}>
        {primary}
      </span>
      {secondary && (
        <>
          <span className="text-[var(--color-text-faint)]">·</span>
          <span className={tone === "stale" ? "italic text-[var(--color-text-faint)]" : "text-[var(--color-text-dim)]"}>
            {secondary}
          </span>
        </>
      )}
    </span>
  );
}
