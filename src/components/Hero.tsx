import {
  Area,
  AreaChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendUp, TrendDown } from "@phosphor-icons/react";
import { formatNumber, formatNumberLong, formatUSD } from "../lib/format";
import { tokenTotal, type DailyPoint, type WindowSummary } from "../lib/types";

type Props = {
  today: WindowSummary;
  trailing: DailyPoint[];
  subscriptionLine?: string | null;
};

const DEFAULT_SUBSCRIPTION_LINE = "API list price · Max 20x is fixed at $200/mo";

export function Hero({ today, trailing, subscriptionLine }: Props) {
  const subLine =
    subscriptionLine === undefined ? DEFAULT_SUBSCRIPTION_LINE : subscriptionLine;
  const total = tokenTotal(today.tokens);
  const sparkData = trailing.slice(-14).map((p) => ({
    date: p.date,
    tokens: tokenTotal(p.tokens),
    cost: p.costUsd,
  }));
  const peak = Math.max(0, ...sparkData.map((p) => p.tokens));
  const peakPoint = sparkData.find((p) => p.tokens === peak && peak > 0);
  const avg =
    sparkData.length > 0
      ? sparkData.reduce((s, p) => s + p.tokens, 0) / sparkData.length
      : 0;
  const yesterday =
    sparkData.length >= 2 ? sparkData[sparkData.length - 2].tokens : 0;
  const delta = yesterday > 0 ? ((total - yesterday) / yesterday) * 100 : null;
  const breakdown = [
    { label: "Input", value: today.tokens.inputTokens, color: "#111111" },
    { label: "Output", value: today.tokens.outputTokens, color: "#4A4A48" },
    {
      label: "Cache write",
      value: today.tokens.cacheCreationTokens,
      color: "#787774",
    },
    {
      label: "Cache read",
      value: today.tokens.cacheReadTokens,
      color: "#C4C4C0",
    },
  ];
  const sum = total || 1;
  const now = new Date();

  return (
    <section className="px-7 pt-7 pb-6" data-shot="hero">
      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <div className="eyebrow">
            today ·{" "}
            {now.toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </div>
          <div className="mt-3 flex items-end gap-3">
            <div
              className="display text-[80px] leading-none text-[var(--color-ink)]"
              title={formatNumberLong(total) + " tokens"}
            >
              {formatNumber(total)}
            </div>
            <div className="pb-3 text-sm font-medium text-[var(--color-text-dim)]">
              tokens
            </div>
            {delta !== null && (
              <div
                className={`pb-3.5 inline-flex items-center gap-1 num text-xs font-semibold ${
                  delta >= 0 ? "text-[var(--pastel-red-fg)]" : "text-[var(--pastel-green-fg)]"
                }`}
              >
                {delta >= 0 ? <TrendUp size={12} weight="bold" /> : <TrendDown size={12} weight="bold" />}
                {Math.abs(delta).toFixed(0)}%
                <span className="ml-0.5 text-[10px] font-medium text-[var(--color-text-faint)]">
                  vs yesterday
                </span>
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center gap-3 text-[12.5px] text-[var(--color-text-dim)]">
            <span className="num font-semibold text-[var(--color-text)]">
              {today.messageCount.toLocaleString()}
            </span>
            <span>messages</span>
            <span className="text-[var(--color-text-faint)]">·</span>
            <span className="num font-semibold text-[var(--color-ink)]">
              {formatUSD(today.costUsd)}
            </span>
            <span>est. cost</span>
          </div>
          {subLine && (
            <div className="mt-1 text-[11.5px] text-[var(--color-text-faint)]">
              {subLine}
            </div>
          )}

          <div className="mt-7">
            <div className="mb-2 flex items-center justify-between">
              <span className="eyebrow !bg-transparent !p-0 !tracking-[0.18em] !text-[var(--color-text-faint)]">
                Today's mix
              </span>
              <span className="num text-[10.5px] text-[var(--color-text-faint)]">
                {formatNumber(sum)} total
              </span>
            </div>
            <div className="flex h-2 w-full gap-px overflow-hidden rounded-sm bg-[var(--color-bg-soft)]">
              {breakdown.map((b) => (
                <div
                  key={b.label}
                  style={{
                    width: `${(b.value / sum) * 100}%`,
                    background: b.color,
                  }}
                  className="h-full"
                  title={`${b.label}: ${formatNumberLong(b.value)}`}
                />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-xs sm:grid-cols-4">
              {breakdown.map((b) => {
                const pct = (b.value / sum) * 100;
                return (
                  <div key={b.label} className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[var(--color-text-dim)]">
                      <span
                        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: b.color }}
                      />
                      <span className="truncate font-medium">{b.label}</span>
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span
                        className="num font-semibold text-[var(--color-text)]"
                        title={formatNumberLong(b.value)}
                      >
                        {formatNumber(b.value)}
                      </span>
                      <span className="num text-[10px] text-[var(--color-text-faint)]">
                        {pct.toFixed(pct < 1 ? 2 : 1)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">Last 14 days</span>
            {peakPoint && (
              <span className="num text-[10.5px] text-[var(--color-text-faint)]">
                peak {formatNumber(peak)}
              </span>
            )}
          </div>
          <div className="mt-3 h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={sparkData}
                margin={{ left: 0, right: 8, top: 16, bottom: 0 }}
              >
                <XAxis dataKey="date" hide />
                <YAxis hide domain={[0, "auto"]} />
                {avg > 0 && (
                  <ReferenceLine
                    y={avg}
                    stroke="#A8A29E"
                    strokeDasharray="3 5"
                    strokeOpacity={0.7}
                  />
                )}
                <Tooltip
                  cursor={{
                    stroke: "#787774",
                    strokeWidth: 1,
                    strokeDasharray: "2 3",
                  }}
                  wrapperStyle={{ outline: "none" }}
                  content={<MiniTooltip />}
                />
                <Area
                  type="monotone"
                  dataKey="tokens"
                  stroke="#111111"
                  strokeWidth={2}
                  fill="#111111"
                  fillOpacity={0.06}
                  activeDot={{
                    r: 4,
                    stroke: "#111111",
                    strokeWidth: 2,
                    fill: "#fff",
                  }}
                />
                {peakPoint && (
                  <ReferenceDot
                    x={peakPoint.date}
                    y={peakPoint.tokens}
                    r={4}
                    fill="#111111"
                    stroke="#fff"
                    strokeWidth={2}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex justify-between num text-[10px] text-[var(--color-text-faint)]">
            <span>{sparkData[0]?.date ?? ""}</span>
            <span>{sparkData[sparkData.length - 1]?.date ?? ""}</span>
          </div>
          {peakPoint && (
            <div className="mt-3 text-[12px] text-[var(--color-text-dim)]">
              peak <span className="num font-semibold text-[var(--color-ink)]">{formatNumber(peak)}</span> on {peakPoint.date} · avg{" "}
              <span className="num font-semibold text-[var(--color-text)]">{formatNumber(Math.round(avg))}</span>/day
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function MiniTooltip(props: any) {
  const { active, payload } = props;
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-[var(--color-hairline)] bg-white px-3 py-2 text-[11px] shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      <div className="num text-[var(--color-text-dim)]">{d.date}</div>
      <div className="mt-0.5 flex items-center gap-2">
        <span className="num font-semibold text-[var(--color-text)]">
          {formatNumber(d.tokens)}
        </span>
        <span className="text-[var(--color-text-faint)]">·</span>
        <span className="num font-semibold text-[var(--color-ink)]">
          {formatUSD(d.cost)}
        </span>
      </div>
    </div>
  );
}
