import { formatNumber, formatNumberLong, formatUSD } from "../lib/format";
import { tokenTotal, type WindowSummary } from "../lib/types";

type Row = {
  label: string;
  data: WindowSummary;
  emphasis?: boolean;
};

type Props = {
  today: WindowSummary;
  last7Days: WindowSummary;
  last30Days: WindowSummary;
  allTime: WindowSummary;
  dataSince: string | null;
  /** Monthly subscription cost in USD. `null` hides the savings banner. */
  subscriptionMonthlyUsd?: number | null;
  /** Plan label rendered in the savings banner ("Max 20x", "Codex Pro", etc). */
  subscriptionName?: string;
};

export function Windows({
  today,
  last7Days,
  last30Days,
  allTime,
  dataSince,
  subscriptionMonthlyUsd = 200,
  subscriptionName = "Max 20x",
}: Props) {
  const rows: Row[] = [
    { label: "Today", data: today, emphasis: true },
    { label: "Last 7 days", data: last7Days },
    { label: "Last 30 days", data: last30Days },
    { label: "All time", data: allTime },
  ];
  const peak = Math.max(...rows.map((r) => tokenTotal(r.data.tokens)), 1);

  const sinceNote = formatSinceNote(dataSince);

  return (
    <section className="px-7 py-6" data-shot="windows">
      <div className="flex items-baseline justify-between gap-4">
        <div className="eyebrow">Time windows</div>
        {sinceNote && (
          <div className="num text-[10.5px] text-[var(--color-text-faint)]">
            {sinceNote}
          </div>
        )}
      </div>

      <SavingsBanner
        last30Cost={last30Days.costUsd}
        dataSince={dataSince}
        subscriptionMonthlyUsd={subscriptionMonthlyUsd}
        subscriptionName={subscriptionName}
      />

      <div className="mt-5 grid grid-cols-[1.2fr_2fr_minmax(0,0.7fr)_minmax(0,0.8fr)] gap-x-4 num text-[10.5px] uppercase tracking-widest text-[var(--color-text-faint)]">
        <div>window</div>
        <div>tokens</div>
        <div className="text-right">msgs</div>
        <div className="text-right">est. cost</div>
      </div>

      <div className="mt-2 space-y-1">
        {rows.map((r) => {
          const tk = tokenTotal(r.data.tokens);
          const w = (tk / peak) * 100;
          return (
            <div
              key={r.label}
              className={`grid grid-cols-[1.2fr_2fr_minmax(0,0.7fr)_minmax(0,0.8fr)] items-center gap-x-4 rounded-lg px-3 py-2.5 ${
                r.emphasis ? "bg-[var(--color-bg-soft)]" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                {r.emphasis && (
                  <span className="rounded-full bg-[var(--color-ink)] px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-widest text-[#F7F6F3]">
                    now
                  </span>
                )}
                <span
                  className={`text-[12.5px] ${
                    r.emphasis
                      ? "font-semibold text-[var(--color-text)]"
                      : "font-medium text-[var(--color-text-dim)]"
                  }`}
                >
                  {r.label}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={
                    r.emphasis
                      ? "display min-w-[64px] text-lg text-[var(--color-text)]"
                      : "num min-w-[64px] text-[12.5px] font-medium text-[var(--color-text)]"
                  }
                  title={formatNumberLong(tk) + " tokens"}
                >
                  {formatNumber(tk)}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-[var(--color-bg-soft)]">
                  <div
                    className="h-full rounded-sm transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]"
                    style={{
                      width: `${w}%`,
                      background: r.emphasis ? "#111111" : "#C4C4C0",
                    }}
                  />
                </div>
              </div>
              <div className="num text-right text-[12.5px] font-medium text-[var(--color-text-dim)]">
                {r.data.messageCount.toLocaleString()}
              </div>
              <div
                className={`num text-right text-[12.5px] ${
                  r.emphasis
                    ? "font-semibold text-[var(--color-ink)]"
                    : "font-medium text-[var(--color-text-dim)]"
                }`}
              >
                {formatUSD(r.data.costUsd)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SavingsBanner({
  last30Cost,
  dataSince,
  subscriptionMonthlyUsd,
  subscriptionName,
}: {
  last30Cost: number;
  dataSince: string | null;
  subscriptionMonthlyUsd: number | null;
  subscriptionName: string;
}) {
  if (subscriptionMonthlyUsd === null) return null;
  const days = daysOfData(dataSince);
  const proratedFee = (subscriptionMonthlyUsd * Math.min(days, 30)) / 30;
  const saved = last30Cost - proratedFee;
  if (saved <= 0) return null;
  const periodLabel =
    days < 30 ? `over ${days} day${days === 1 ? "" : "s"}` : "over 30 days";
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--pastel-green-bg)] border border-[#D6E2D6] p-4">
      <div className="text-[12.5px] text-[var(--color-text-dim)]">
        <span className="num font-semibold text-[var(--color-ink)]">
          {formatUSD(last30Cost)}
        </span>{" "}
        in API value {periodLabel}
        <span className="mx-2 text-[var(--color-text-faint)]">·</span>
        you pay{" "}
        <span className="num font-semibold text-[var(--color-text)]">
          ${subscriptionMonthlyUsd}/mo
        </span>{" "}
        on {subscriptionName}{" "}
        {days < 30 && (
          <span className="text-[var(--color-text-faint)]">
            (~{formatUSD(proratedFee)} so far)
          </span>
        )}
      </div>
      <div className="pill-chip !bg-white !text-[var(--pastel-green-fg)] border border-[var(--color-hairline)]">
        saved ~{formatUSD(saved)}
      </div>
    </div>
  );
}

function daysOfData(dataSince: string | null): number {
  if (!dataSince) return 30;
  const start = new Date(dataSince + "T00:00:00");
  if (Number.isNaN(start.getTime())) return 30;
  return Math.max(
    1,
    Math.floor((Date.now() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1,
  );
}

function formatSinceNote(dataSince: string | null): string {
  if (!dataSince) return "";
  const start = new Date(dataSince + "T00:00:00");
  if (Number.isNaN(start.getTime())) return "";
  const days = Math.max(
    1,
    Math.floor((Date.now() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1,
  );
  const pretty = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `since ${pretty} · ${days} day${days === 1 ? "" : "s"}`;
}
