"""[DEBUG-tz1] Final audit — Codex deduped + Claude duplicate check."""
import os, glob, json, datetime as dt
from collections import defaultdict

home = os.path.expanduser('~')
now_local = dt.datetime.now().astimezone()
today = now_local.date()
start_today_utc = dt.datetime.combine(today, dt.time.min).astimezone().astimezone(dt.timezone.utc)
now_utc = dt.datetime.now(dt.timezone.utc)
start_30 = now_utc - dt.timedelta(days=30)


# === CLAUDE: check duplicate msg_id within same file ===
proj = os.path.join(home, '.claude', 'projects')
claude_files = glob.glob(os.path.join(proj, '**', '*.jsonl'), recursive=True)
claude_dup_count = 0
for fp in claude_files:
    seen = set()
    try:
        with open(fp, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line: continue
                try: o = json.loads(line)
                except: continue
                if o.get('type') != 'assistant': continue
                msg = o.get('message') or {}
                mid = msg.get('id')
                if not mid: continue
                if mid in seen: claude_dup_count += 1
                seen.add(mid)
    except Exception:
        pass
print(f"=== CLAUDE: duplicate assistant msg_ids within same file: {claude_dup_count} ===")

# === CLAUDE proper aggregate (with msg_id dedup safety) ===
def claude_price(model):
    m = model.lower()
    if "opus" in m: return 15.0, 75.0, 18.75, 1.50
    if "haiku" in m:
        if "haiku-4" in m: return 1.0, 5.0, 1.25, 0.10
        return 0.80, 4.0, 1.0, 0.08
    return 3.0, 15.0, 3.75, 0.30


today_in=today_out=today_cw=today_cr=0
today_cost=0.0; today_msg=0
all_in=all_out=all_cw=all_cr=0
by_model_claude = defaultdict(lambda: [0,0,0,0,0,0.0])
for fp in claude_files:
    seen_msgs = set()
    try:
        with open(fp, encoding='utf-8') as f:
            for line in f:
                line=line.strip()
                if not line: continue
                try: o=json.loads(line)
                except: continue
                if o.get('type') != 'assistant': continue
                msg = o.get('message') or {}
                mid = msg.get('id')
                if mid:
                    if mid in seen_msgs: continue
                    seen_msgs.add(mid)
                usage = msg.get('usage')
                if not usage: continue
                ts_str = o.get('timestamp','')
                try: ts = dt.datetime.fromisoformat(ts_str.replace('Z','+00:00'))
                except: continue
                model = msg.get('model') or 'unknown'
                if model.startswith('<'): continue
                inp=int(usage.get('input_tokens',0) or 0)
                out=int(usage.get('output_tokens',0) or 0)
                cw=int(usage.get('cache_creation_input_tokens',0) or 0)
                cr=int(usage.get('cache_read_input_tokens',0) or 0)
                if inp+out+cw+cr==0: continue
                p=claude_price(model)
                c=inp*p[0]/1e6+out*p[1]/1e6+cw*p[2]/1e6+cr*p[3]/1e6
                all_in+=inp; all_out+=out; all_cw+=cw; all_cr+=cr
                if ts >= start_today_utc:
                    today_in+=inp; today_out+=out; today_cw+=cw; today_cr+=cr
                    today_cost+=c; today_msg+=1
                bm=by_model_claude[model]
                bm[0]+=inp; bm[1]+=out; bm[2]+=cw; bm[3]+=cr; bm[4]+=1; bm[5]+=c
    except Exception:
        pass

print(f"\n=== CLAUDE today (local {today}) ===")
print(f"  in={today_in:,}  out={today_out:,}  cw={today_cw:,}  cr={today_cr:,}  TOTAL={today_in+today_out+today_cw+today_cr:,}  msgs={today_msg}  cost=${today_cost:,.2f}")
print(f"=== CLAUDE all-time ===")
print(f"  TOTAL={all_in+all_out+all_cw+all_cr:,}")
print("=== Claude by model ===")
for m, vals in sorted(by_model_claude.items(), key=lambda x: -sum(x[1][:4])):
    total = sum(vals[:4])
    print(f"  {m:<40} total={total:>13,}  cost=${vals[5]:>10,.2f}  msgs={vals[4]}")


# === CODEX with dedup ===
def codex_price(model):
    m = model.lower()
    if "gpt-5-codex" in m or "codex" in m or "gpt-5" in m: return 1.25, 10.0, 1.25, 0.125
    if "gpt-4.1-mini" in m or "gpt-4o-mini" in m: return 0.40, 1.60, 0.40, 0.10
    if "gpt-4.1" in m or "gpt-4o" in m: return 2.0, 8.0, 2.0, 0.50
    return 1.25, 10.0, 1.25, 0.125


cdir = os.path.join(home, '.codex')
files = glob.glob(os.path.join(cdir, 'sessions', '**', '*.jsonl'), recursive=True) + \
        glob.glob(os.path.join(cdir, 'archived_sessions', '*.jsonl'))

c_today=[0,0,0,0]; c_today_cost=0.0; c_today_msg=0
c_30=[0,0,0,0]; c_30_cost=0.0
c_all=[0,0,0,0]; c_all_msg=0
c_by_model = defaultdict(lambda: [0,0,0,0,0,0.0])
total_dups = 0

for fp in files:
    cur_model = ""
    prev_sig = None
    try:
        with open(fp, encoding='utf-8') as f:
            for line in f:
                line=line.strip()
                if not line: continue
                try: o=json.loads(line)
                except: continue
                ts_str=o.get('timestamp','')
                try: ts=dt.datetime.fromisoformat(ts_str.replace('Z','+00:00'))
                except: continue
                et=o.get('type')
                p=o.get('payload') or {}
                if et=='turn_context':
                    m=p.get('model')
                    if m: cur_model=m
                elif et=='session_meta':
                    m=p.get('model')
                    if m and not cur_model: cur_model=m
                elif et=='event_msg' and p.get('type')=='token_count':
                    info=p.get('info')
                    if info is None: continue
                    last=info.get('last_token_usage')
                    if not last: continue
                    raw_in=int(last.get('input_tokens',0) or 0)
                    cached=int(last.get('cached_input_tokens',0) or 0)
                    out=int(last.get('output_tokens',0) or 0)
                    sig=(raw_in, cached, out)
                    if sig == prev_sig:
                        total_dups += 1
                        continue
                    prev_sig = sig
                    fresh=max(0, raw_in - cached)
                    if fresh + out + cached == 0: continue
                    model = cur_model or "gpt-5"
                    pr = codex_price(model)
                    cost = fresh*pr[0]/1e6 + out*pr[1]/1e6 + cached*pr[3]/1e6
                    c_all[0]+=fresh; c_all[1]+=out; c_all[3]+=cached; c_all_msg+=1
                    if ts >= start_30:
                        c_30[0]+=fresh; c_30[1]+=out; c_30[3]+=cached; c_30_cost+=cost
                    if ts >= start_today_utc:
                        c_today[0]+=fresh; c_today[1]+=out; c_today[3]+=cached
                        c_today_cost+=cost; c_today_msg+=1
                    bm=c_by_model[model]
                    bm[0]+=fresh; bm[1]+=out; bm[3]+=cached; bm[4]+=1; bm[5]+=cost
    except Exception:
        pass

print(f"\n=== CODEX (deduped) — duplicates skipped: {total_dups} ===")
print(f"=== CODEX today (local {today}) ===")
print(f"  fresh_in={c_today[0]:,}  out={c_today[1]:,}  cached={c_today[3]:,}  TOTAL={sum(c_today):,}  msgs={c_today_msg}  cost=${c_today_cost:,.2f}")
print(f"=== CODEX last 30d ===")
print(f"  TOTAL={sum(c_30):,}  cost=${c_30_cost:,.2f}")
print(f"=== CODEX all-time ===")
print(f"  TOTAL={sum(c_all):,}  msgs={c_all_msg}")
print("=== Codex by model ===")
for m, v in sorted(c_by_model.items(), key=lambda x: -sum(x[1][:4])):
    print(f"  {m:<20} total={sum(v[:4]):>12,}  cost=${v[5]:>10,.2f}  msgs={v[4]}")
