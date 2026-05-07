"""
[DEBUG-tz1] Independent ground-truth audit for ccbar's token + cost math.
Reads ~/.claude/ and ~/.codex/ the same way the Rust backend does, computes
totals, and prints them. Compare against the running app to verify parity.
"""
from __future__ import annotations
import datetime as dt
import glob
import json
import os
from collections import defaultdict


# --------- Time helpers (mirror lib.rs::local_today_start_utc) ---------
def local_today_start_utc() -> tuple[dt.date, dt.datetime]:
    now_local = dt.datetime.now().astimezone()
    today = now_local.date()
    start_local = dt.datetime.combine(today, dt.time.min).astimezone()
    return today, start_local.astimezone(dt.timezone.utc)


# --------- Pricing (mirror src-tauri/src/{pricing,codex_pricing}.rs) ---------
def claude_price(model: str) -> tuple[float, float, float, float]:
    m = model.lower()
    if "opus" in m:
        return 15.0, 75.0, 18.75, 1.50
    if "haiku" in m:
        if "haiku-4" in m:
            return 1.0, 5.0, 1.25, 0.10
        return 0.80, 4.0, 1.0, 0.08
    return 3.0, 15.0, 3.75, 0.30  # sonnet


def claude_family(model: str) -> str:
    m = model.lower()
    if "opus" in m:
        return "Opus"
    if "haiku" in m:
        return "Haiku"
    if "sonnet" in m:
        return "Sonnet"
    return "Other"


def codex_price(model: str) -> tuple[float, float, float, float]:
    m = model.lower()
    if "gpt-5-codex" in m or "codex" in m or "gpt-5" in m:
        return 1.25, 10.0, 1.25, 0.125
    if "gpt-4.1-mini" in m or "gpt-4o-mini" in m:
        return 0.40, 1.60, 0.40, 0.10
    if "gpt-4.1" in m in m or "gpt-4o" in m:
        return 2.0, 8.0, 2.0, 0.50
    return 1.25, 10.0, 1.25, 0.125


def cost(price, input_tokens, output_tokens, cache_creation, cache_read):
    inp, out, cw, cr = price
    return (
        input_tokens * inp / 1e6
        + output_tokens * out / 1e6
        + cache_creation * cw / 1e6
        + cache_read * cr / 1e6
    )


# --------- Claude audit (~/.claude/projects/**/*.jsonl assistant.message.usage) ---------
def audit_claude():
    home = os.path.expanduser("~")
    proj = os.path.join(home, ".claude", "projects")
    if not os.path.isdir(proj):
        print("[claude] no ~/.claude/projects/ — skipping")
        return
    files = glob.glob(os.path.join(proj, "**", "*.jsonl"), recursive=True)
    today, start_today_utc = local_today_start_utc()
    now_utc = dt.datetime.now(dt.timezone.utc)
    start_30_utc = now_utc - dt.timedelta(days=30)

    todays = [0, 0, 0, 0]   # in, out, cw, cr
    last30 = [0, 0, 0, 0]
    alltime = [0, 0, 0, 0]
    today_msg_count = 0
    today_cost = 0.0
    last30_cost = 0.0
    by_model = defaultdict(lambda: [0, 0, 0, 0, 0, 0.0])  # in, out, cw, cr, count, cost

    for fp in files:
        try:
            with open(fp, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except Exception:
                        continue
                    if obj.get("type") != "assistant":
                        continue
                    msg = obj.get("message")
                    if not msg:
                        continue
                    usage = msg.get("usage")
                    if not usage:
                        continue
                    ts_str = obj.get("timestamp", "")
                    try:
                        ts = dt.datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                    except Exception:
                        continue
                    model = msg.get("model") or "unknown"
                    if model.startswith("<"):
                        continue
                    inp = int(usage.get("input_tokens", 0) or 0)
                    out = int(usage.get("output_tokens", 0) or 0)
                    cw = int(usage.get("cache_creation_input_tokens", 0) or 0)
                    cr = int(usage.get("cache_read_input_tokens", 0) or 0)
                    if inp + out + cw + cr == 0:
                        continue
                    price = claude_price(model)
                    c = cost(price, inp, out, cw, cr)
                    for arr in (alltime,):
                        arr[0] += inp; arr[1] += out; arr[2] += cw; arr[3] += cr
                    if ts >= start_30_utc:
                        last30[0] += inp; last30[1] += out; last30[2] += cw; last30[3] += cr
                        last30_cost += c
                    if ts >= start_today_utc:
                        todays[0] += inp; todays[1] += out; todays[2] += cw; todays[3] += cr
                        today_msg_count += 1
                        today_cost += c
                    bm = by_model[model]
                    bm[0] += inp; bm[1] += out; bm[2] += cw; bm[3] += cr; bm[4] += 1; bm[5] += c
        except Exception as e:
            print(f"[claude] skip {fp}: {e}")

    print(f"\n=== CLAUDE — local today = {today} (TZ={dt.datetime.now().astimezone().tzname()}) ===")
    print(f"Today    in={todays[0]:>12,}  out={todays[1]:>12,}  cw={todays[2]:>12,}  cr={todays[3]:>12,}  TOTAL={sum(todays):>13,}  msgs={today_msg_count}  cost=${today_cost:,.2f}")
    print(f"Last30d  in={last30[0]:>12,}  out={last30[1]:>12,}  cw={last30[2]:>12,}  cr={last30[3]:>12,}  TOTAL={sum(last30):>13,}  cost=${last30_cost:,.2f}")
    print(f"AllTime  in={alltime[0]:>12,}  out={alltime[1]:>12,}  cw={alltime[2]:>12,}  cr={alltime[3]:>12,}  TOTAL={sum(alltime):>13,}")
    print(f"\nBy model (all-time):")
    for model, vals in sorted(by_model.items(), key=lambda x: -sum(x[1][:4])):
        total = sum(vals[:4])
        print(f"  {model:<40} fam={claude_family(model):<7} total={total:>13,}  cost=${vals[5]:>10,.2f}  msgs={vals[4]}")


# --------- Codex audit (~/.codex/sessions/**/*.jsonl event_msg.token_count) ---------
def audit_codex():
    home = os.path.expanduser("~")
    cdir = os.path.join(home, ".codex")
    if not os.path.isdir(cdir):
        print("[codex] no ~/.codex/ — skipping")
        return
    files = glob.glob(os.path.join(cdir, "sessions", "**", "*.jsonl"), recursive=True) + \
            glob.glob(os.path.join(cdir, "archived_sessions", "*.jsonl"))
    today, start_today_utc = local_today_start_utc()
    now_utc = dt.datetime.now(dt.timezone.utc)
    start_30_utc = now_utc - dt.timedelta(days=30)

    todays = [0, 0, 0, 0]
    last30 = [0, 0, 0, 0]
    alltime = [0, 0, 0, 0]
    today_msg_count = 0
    today_cost = 0.0
    last30_cost = 0.0
    by_model = defaultdict(lambda: [0, 0, 0, 0, 0, 0.0])

    for fp in files:
        current_model = ""
        try:
            with open(fp, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except Exception:
                        continue
                    ts_str = obj.get("timestamp", "")
                    try:
                        ts = dt.datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                    except Exception:
                        continue
                    et = obj.get("type")
                    p = obj.get("payload") or {}
                    if et == "turn_context":
                        m = p.get("model")
                        if m:
                            current_model = m
                    elif et == "session_meta":
                        m = p.get("model")
                        if m and not current_model:
                            current_model = m
                    elif et == "event_msg":
                        if p.get("type") != "token_count":
                            continue
                        info = p.get("info")
                        if info is None:
                            continue
                        last = info.get("last_token_usage")
                        if not last:
                            continue
                        raw_in = int(last.get("input_tokens", 0) or 0)
                        cached = int(last.get("cached_input_tokens", 0) or 0)
                        out = int(last.get("output_tokens", 0) or 0)
                        fresh = max(0, raw_in - cached)
                        total = fresh + out + cached
                        if total == 0:
                            continue
                        model = current_model or "gpt-5"
                        price = codex_price(model)
                        # mapping: input=fresh, output=out, cache_write=0, cache_read=cached
                        c = cost(price, fresh, out, 0, cached)
                        alltime[0] += fresh; alltime[1] += out; alltime[3] += cached
                        if ts >= start_30_utc:
                            last30[0] += fresh; last30[1] += out; last30[3] += cached
                            last30_cost += c
                        if ts >= start_today_utc:
                            todays[0] += fresh; todays[1] += out; todays[3] += cached
                            today_msg_count += 1
                            today_cost += c
                        bm = by_model[model]
                        bm[0] += fresh; bm[1] += out; bm[3] += cached; bm[4] += 1; bm[5] += c
        except Exception as e:
            print(f"[codex] skip {fp}: {e}")

    print(f"\n=== CODEX — local today = {today} (TZ={dt.datetime.now().astimezone().tzname()}) ===")
    print(f"Today    in={todays[0]:>12,}  out={todays[1]:>12,}  cw={todays[2]:>12,}  cr={todays[3]:>12,}  TOTAL={sum(todays):>13,}  msgs={today_msg_count}  cost=${today_cost:,.2f}")
    print(f"Last30d  in={last30[0]:>12,}  out={last30[1]:>12,}  cw={last30[2]:>12,}  cr={last30[3]:>12,}  TOTAL={sum(last30):>13,}  cost=${last30_cost:,.2f}")
    print(f"AllTime  in={alltime[0]:>12,}  out={alltime[1]:>12,}  cw={alltime[2]:>12,}  cr={alltime[3]:>12,}  TOTAL={sum(alltime):>13,}")
    print(f"\nBy model (all-time):")
    for model, vals in sorted(by_model.items(), key=lambda x: -sum(x[1][:4])):
        total = sum(vals[:4])
        print(f"  {model:<40} total={total:>13,}  cost=${vals[5]:>10,.2f}  msgs={vals[4]}")


if __name__ == "__main__":
    audit_claude()
    audit_codex()
