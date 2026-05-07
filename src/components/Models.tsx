import {
  claudeFamilyColors,
  formatNumber,
  formatNumberLong,
  formatUSD,
  type FamilyColorizer,
} from "../lib/format";
import { tokenTotal, type ModelBreakdown } from "../lib/types";

type LegendItem = { label: string; color: string };

type Props = {
  models: ModelBreakdown[];
  /** Provider-specific family→color resolver. Defaults to Claude's. */
  colorizer?: FamilyColorizer;
  /** Legend items shown top-right. Defaults to Claude's Opus/Sonnet/Haiku. */
  legend?: LegendItem[];
};

const CLAUDE_LEGEND: LegendItem[] = [
  { label: "Opus", color: "#111111" },
  { label: "Sonnet", color: "#787774" },
  { label: "Haiku", color: "#C4C4C0" },
];

export function Models({ models, colorizer = claudeFamilyColors, legend = CLAUDE_LEGEND }: Props) {
  const totalTokens = models.reduce((s, m) => s + tokenTotal(m.tokens), 0);
  const totalCost = models.reduce((s, m) => s + m.costUsd, 0);
  const peak = Math.max(1, ...models.map((m) => tokenTotal(m.tokens)));

  return (
    <section className="px-7 py-6" data-shot="models">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Models · 30d</div>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="display text-3xl text-[var(--color-text)]">
              {models.length}
            </span>
            <span className="text-[12.5px] font-medium text-[var(--color-text-dim)]">
              distinct models
            </span>
            <span className="text-[var(--color-text-faint)]">·</span>
            <span className="num font-semibold text-sm text-[var(--color-ink)]">
              {formatUSD(totalCost)}
            </span>
          </div>
        </div>
        <Legend items={legend} />
      </div>

      {models.length === 0 ? (
        <div className="mt-5 text-[13px] text-[var(--color-text-dim)]">
          No model activity in the last 30 days.
        </div>
      ) : (
        <div className="mt-5 space-y-1.5">
          {models.map((m) => {
            const tk = tokenTotal(m.tokens);
            const share = totalTokens ? (tk / totalTokens) * 100 : 0;
            const barW = (tk / peak) * 100;
            const tone = colorizer(m.family);
            const color = tone.color;
            const pastel = tone.pastel;
            return (
              <div
                key={m.model}
                className="group rounded-lg px-3 py-2.5 transition hover:bg-[var(--color-bg-soft)]"
              >
                <div className="flex items-center gap-3 text-[12.5px]">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                  <span className="num min-w-0 flex-1 truncate font-medium text-[var(--color-text)]">
                    {m.model}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 num text-[10px] font-medium uppercase tracking-widest"
                    style={{
                      background: pastel.bg,
                      color: pastel.fg,
                    }}
                  >
                    {m.family}
                  </span>
                  <span
                    className="num w-16 text-right font-medium text-[var(--color-text-dim)]"
                    title={formatNumberLong(tk) + " tokens"}
                  >
                    {formatNumber(tk)}
                  </span>
                  <span className="num w-12 text-right text-[10.5px] text-[var(--color-text-faint)]">
                    {share.toFixed(share < 1 ? 2 : 1)}%
                  </span>
                  <span className="num w-16 text-right font-semibold text-[var(--color-ink)]">
                    {formatUSD(m.costUsd)}
                  </span>
                </div>
                <div className="mt-2 ml-5 h-1.5 w-[calc(100%-1.25rem)] overflow-hidden rounded-sm bg-[var(--color-bg-soft)]">
                  <div
                    className="h-full rounded-sm transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]"
                    style={{ width: `${barW}%`, background: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Legend({ items }: { items: LegendItem[] }) {
  return (
    <div className="hidden gap-3 num text-[10.5px] font-medium text-[var(--color-text-dim)] sm:flex">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: i.color }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}
