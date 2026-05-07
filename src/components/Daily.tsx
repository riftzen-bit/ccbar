import {
  Bar,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber, formatShortDate, formatUSD } from "../lib/format";
import { tokenTotal, type DailyPoint } from "../lib/types";

type Datum = {
  date: string;
  label: string;
  tokens: number;
  cost: number;
};

type Props = { points: DailyPoint[] };

export function Daily({ points }: Props) {
  const data: Datum[] = points.map((p) => ({
    date: p.date,
    label: formatShortDate(p.date),
    tokens: tokenTotal(p.tokens),
    cost: p.costUsd,
  }));
  const peak = Math.max(0, ...data.map((d) => d.tokens));
  const peakIdx = data.findIndex((d) => d.tokens === peak && peak > 0);
  const totalTokens = data.reduce((s, d) => s + d.tokens, 0);
  const totalCost = data.reduce((s, d) => s + d.cost, 0);
  const avg = data.length > 0 ? totalTokens / data.length : 0;

  return (
    <section className="px-7 py-6" data-shot="daily">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Daily activity</div>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="display text-3xl text-[var(--color-text)]">
              {formatNumber(totalTokens)}
            </span>
            <span className="text-[12.5px] font-medium text-[var(--color-text-dim)]">
              tokens · 30d
            </span>
            <span className="text-[var(--color-text-faint)]">·</span>
            <span className="num font-semibold text-sm text-[var(--color-ink)]">
              {formatUSD(totalCost)}
            </span>
          </div>
        </div>
        {peakIdx >= 0 && (
          <div className="pill-chip !bg-[var(--pastel-red-bg)] !text-[var(--pastel-red-fg)]">
            peak {formatNumber(peak)} · {data[peakIdx].date}
          </div>
        )}
      </div>

      <div className="mt-5 h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
          >
            <XAxis
              dataKey="label"
              stroke="#A8A29E"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              interval={3}
            />
            <YAxis
              stroke="#A8A29E"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatNumber(v as number)}
              width={42}
            />
            {avg > 0 && (
              <ReferenceLine
                y={avg}
                stroke="#A8A29E"
                strokeDasharray="3 5"
                strokeOpacity={0.8}
              />
            )}
            <Tooltip
              wrapperStyle={{ outline: "none" }}
              cursor={{ fill: "rgba(17, 17, 17, 0.04)" }}
              content={<DailyTooltip />}
            />
            <Bar dataKey="tokens" fill="#111111" radius={[4, 4, 0, 0]} />
            <Line
              type="monotone"
              dataKey="tokens"
              stroke="#787774"
              strokeWidth={1}
              dot={false}
              opacity={0.4}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function DailyTooltip(props: any) {
  const { active, payload } = props;
  if (!active || !payload?.length) return null;
  const d: Datum = payload[0].payload;
  return (
    <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-3 text-xs shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      <div className="num text-[10.5px] uppercase tracking-widest text-[var(--color-text-faint)]">
        {d.date}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="num text-sm font-semibold text-[var(--color-text)]">
          {formatNumber(d.tokens)}
        </span>
        <span className="text-[var(--color-text-faint)]">tokens</span>
      </div>
      <div className="num font-semibold text-[var(--color-ink)]">
        {formatUSD(d.cost)}
      </div>
    </div>
  );
}
