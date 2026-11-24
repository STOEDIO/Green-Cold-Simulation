import { memo, useEffect, useMemo, useState } from "react";
import { FAMILIES, FAMILY_NAME, recommended, familyBests, shortDescribe, overallRank, scale, ticks, linePath, useWidth, fmt } from "../lib.js";

const L = 52, R = 14;

function MonthAxis({ x, T, D, h }) {
  const out = [];
  for (let m = 0; m <= T / D; m += 3) {
    const px = x(m * D);
    out.push(
      <g key={m}>
        <line x1={px} x2={px} y1={4} y2={h - 18} className="grid" />
        <text x={px} y={h - 4} textAnchor={m === 0 ? "start" : "middle"}>{m === 0 ? "Month 0" : m}</text>
      </g>,
    );
  }
  return out;
}

const DownBands = ({ avail, x, h }) => {
  const out = [];
  let s = -1;
  for (let t = 0; t <= avail.length; t++) {
    const down = t < avail.length && !avail[t];
    if (down && s < 0) s = t;
    if (!down && s >= 0) { out.push(<rect key={t} x={x(s)} y={4} width={x(t) - x(s)} height={h - 22} className="down-band" />); s = -1; }
  }
  return out;
};

const StockChart = memo(function StockChart({ d, w, cfg }) {
  const h = 150, T = d.trace.stock.length, x = scale(0, T, L, w - R), y = scale(0, d.storeCap, h - 22, 6);
  return (
    <svg width={w} height={h} className="chart">
      <DownBands avail={d.trace.avail} x={x} h={h} />
      <MonthAxis x={x} T={T} D={d.daysPerMonth} h={h} />
      {ticks(0, d.storeCap, 4).map((v) => <text key={v} x={L - 8} y={y(v) + 4} textAnchor="end">{fmt.int(v)}</text>)}
      {[cfg.reorder_s, cfg.order_up_to_S].map((v) => <line key={v} x1={L} x2={w - R} y1={y(v)} y2={y(v)} className="ref" />)}
      <path d={linePath(d.trace.stock, x, y)} className="line-ink" />
    </svg>
  );
});

const CrewStrip = memo(function CrewStrip({ d, w }) {
  const h = 46, tr = d.trace, T = tr.stock.length, x = scale(0, T, L, w - R), bw = (w - L - R) / T;
  return (
    <svg width={w} height={h} className="chart">
      <MonthAxis x={x} T={T} D={d.daysPerMonth} h={h} />
      {tr.stock.map((_, t) => {
        const c = !tr.avail[t] && !tr.hand[t] ? "c-down" : tr.belt[t] ? "c-belt" : tr.hand[t] ? "c-hand" : "c-idle";
        return <rect key={t} x={x(t)} y={4} width={Math.max(bw - (bw > 3 ? 0.5 : 0), 0.6)} height={20} className={c} />;
      })}
    </svg>
  );
});

const LeadChart = memo(function LeadChart({ d, w, cfg }) {
  const h = 120, T = d.trace.stock.length, x = scale(0, T, L, w - R);
  const inhouse = cfg.project_mode === "inhouse" || cfg.project_mode === "overflow";
  if (!inhouse) {
    return (
      <svg width={w} height={h} className="chart">
        <MonthAxis x={x} T={T} D={d.daysPerMonth} h={h} />
        <text x={(L + w) / 2} y={h / 2 - 6} textAnchor="middle" className="label">
          {cfg.project_mode === "partner_all" ? "This option sends every project to a partner, so there is no in-house waiting time." : "This option turns project work away."}
        </text>
      </svg>
    );
  }
  const cap = 40, y = scale(0, cap, h - 22, 6);
  return (
    <svg width={w} height={h} className="chart">
      <MonthAxis x={x} T={T} D={d.daysPerMonth} h={h} />
      {[0, 12, 24, 36].map((v) => <text key={v} x={L - 8} y={y(v) + 4} textAnchor="end">{v}</text>)}
      {[[12, "12-day promise"], [24, "client walks away"]].map(([v, n]) => (
        <g key={v}>
          <line x1={L} x2={w - R} y1={y(v)} y2={y(v)} className="ref" />
          <text x={w - R - 4} y={y(v) - 5} textAnchor="end" className="label halo">{n}</text>
        </g>
      ))}
      <path d={linePath(d.trace.lead.map((v) => Math.min(v, cap)), x, y)} className="line-hand" />
    </svg>
  );
});

const ProfitChart = memo(function ProfitChart({ d, w }) {
  const h = 130, T = d.trace.stock.length, D = d.daysPerMonth, M = d.months, x = scale(0, T, L, w - R);
  const hi = Math.max(...d.band.map((b) => b[1]), ...d.mine) * 1.05, y = scale(0, hi, h - 22, 6);
  const bw = (w - L - R) / M;
  return (
    <svg width={w} height={h} className="chart">
      <MonthAxis x={x} T={T} D={D} h={h} />
      {ticks(0, hi, 3).map((v) => <text key={v} x={L - 8} y={y(v) + 4} textAnchor="end">{fmt.int(v)}</text>)}
      {d.band.map(([lo, up], m) => {
        const x0 = x(m * D) + 2, ww = Math.max(2, bw - 4);
        return (
          <g key={m}>
            <rect x={x0} y={y(up)} width={ww} height={Math.max(1, y(lo) - y(up))} rx={2} className="band" />
            <rect x={x0 + ww * 0.3} y={y(d.mine[m])} width={ww * 0.4} height={Math.max(0, y(0) - y(d.mine[m]))} rx={2} className="bar-accent" />
          </g>
        );
      })}
    </svg>
  );
});

const LoyaltyChart = memo(function LoyaltyChart({ d, w }) {
  const h = 120, tr = d.trace, T = tr.stock.length, x = scale(0, T, L, w - R), y = scale(0.3, 1, h - 22, 8);
  const lb = tr.loy_b[T - 1], lp = tr.loy_p[T - 1];
  let yb = y(lb) - 6, yp = y(lp) - 6;
  if (Math.abs(yb - yp) < 13) { if (lp < lb) yp = yb + 15; else yb = yp + 15; }
  return (
    <svg width={w} height={h} className="chart">
      <MonthAxis x={x} T={T} D={d.daysPerMonth} h={h} />
      {[0.4, 0.6, 0.8, 1].map((v) => (
        <g key={v}><line x1={L} x2={w - R} y1={y(v)} y2={y(v)} className="grid" /><text x={L - 8} y={y(v) + 4} textAnchor="end">{fmt.pct(v)}</text></g>
      ))}
      <path d={linePath(tr.loy_b, x, y)} className="line-machine" />
      <path d={linePath(tr.loy_p, x, y)} className="line-hand-2" />
      <text x={w - R - 4} y={yb} textAnchor="end" className="label">builders {fmt.pct(lb)}</text>
      <text x={w - R - 4} y={yp} textAnchor="end" className="label">project clients {fmt.pct(lp)}</text>
    </svg>
  );
});

function Track({ title, legend, cursorX, children }) {
  return (
    <div className="track">
      <div className="track-head">
        <h3>{title}</h3>
        {legend && <div className="legend">{legend}</div>}
      </div>
      <div className="plot">
        {children}
        {cursorX != null && <div className="cursor" style={{ left: cursorX }} aria-hidden="true" />}
      </div>
    </div>
  );
}

function Readout({ d, t, cfg }) {
  const tr = d.trace, D = d.daysPerMonth;
  const inhouse = cfg.project_mode === "inhouse" || cfg.project_mode === "overflow";
  let cum = 0;
  for (let i = 0; i <= t; i++) cum += tr.gp[i];
  const state = !tr.avail[t] && !tr.hand[t]
    ? ["c-down", "No machine: the old one has broken and the new one isn't ready"]
    : tr.belt[t] ? ["c-belt", "Running the machine"] : tr.hand[t] ? ["c-hand", "Building hand panels"] : ["c-idle", "Nothing to do: store is full and no projects waiting"];
  const rows = [
    ["Panels in the store", `${fmt.int(tr.stock[t])} m²`],
    ["Builders ordered", `${fmt.int(tr.dem_b[t])} m²`],
    ["…delivered from stock", `${fmt.int(tr.sold[t])} m²`],
    ["…could not deliver", tr.unmet[t] > 0.5 ? `${fmt.int(tr.unmet[t])} m²${cfg.resale ? ", bought in" : ", lost"}` : "none"],
    ["New project work", `${fmt.int(tr.proj[t])} m²`],
    ["…passed to a partner", `${fmt.int(tr.partner[t])} m²`],
    ["Project delivery time quoted", inhouse ? `${tr.lead[t].toFixed(0)} days` : "partner handles it"],
    ["Profit today", `IDR ${(tr.gp[t] / 1e6).toFixed(0)} million`],
    ["Profit so far", `IDR ${(cum / 1e9).toFixed(2)} billion`],
  ];
  return (
    <aside className="readout" aria-live="off">
      <p className="readout-day">Month {Math.floor(t / D) + 1}, day {(t % D) + 1}</p>
      <p className="readout-state"><i className={`swatch ${state[0]}`} />{state[1]}</p>
      <dl>
        {rows.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}
      </dl>
    </aside>
  );
}

export default function Replay({ rows, version, cfgId, setCfgId, nSims, getReplay }) {
  const [path, setPath] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [stackRef, w] = useWidth();
  const cfg = rows.find((r) => r.id === cfgId);
  const top = recommended(rows), best = familyBests(rows);
  const sorted = useMemo(() => rows.slice().sort((a, b) => a.avg_rank_profiles - b.avg_rank_profiles), [rows]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const data = useMemo(() => getReplay(cfgId, Math.min(path, nSims - 1)), [version, cfgId, path, nSims, getReplay]);

  const T = data ? data.trace.stock.length : 528;
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setCursor((c) => {
      if (c >= T - 1) { setPlaying(false); return c; }
      return c + 1;
    }), 40);
    return () => clearInterval(id);
  }, [playing, T]);

  const play = () => { if (!playing && cursor >= T - 1) setCursor(0); setPlaying(!playing); };
  const onMove = (e) => {
    if (!w) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const t = Math.floor(((e.clientX - rect.left - L) / (w - L - R)) * T);
    setPlaying(false);
    setCursor(Math.max(0, Math.min(T - 1, t)));
  };

  const presets = [["Our recommendation", top.id], ["Best hand hall", best.Hand.id], ["Best machine only", best.Machine.id]];
  const cx = w ? L + ((cursor + 0.5) / T) * (w - L - R) : null;
  const ready = data && data.cfgId === cfgId && w > 0;
  const failText = data && (data.failMonth >= data.months ? "never breaks" : `breaks in month ${Math.floor(data.failMonth) + 1}`);

  return (
    <div className="replay">
      <div className="replay-controls">
        <div className="control-group">
          <span className="control-label">Option</span>
          <div className="seg">
            {presets.map(([n, id]) => (
              <button key={n} type="button" aria-pressed={cfgId === id} onClick={() => setCfgId(id)}>{n}</button>
            ))}
          </div>
          <select aria-label="Choose any of the 152 combinations" value={cfgId} onChange={(e) => setCfgId(+e.target.value)}>
            {FAMILIES.map((f) => (
              <optgroup key={f} label={FAMILY_NAME[f]}>
                {sorted.filter((r) => r.family === f).map((r) => (
                  <option key={r.id} value={r.id}>#{overallRank(rows, r)} · {shortDescribe(r)}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="control-group">
          <span className="control-label">Future</span>
          <button type="button" className="btn" onClick={() => setPath((p) => (p - 1 + nSims) % nSims)} aria-label="Previous future">←</button>
          <span className="num future-n">{path + 1} of {nSims}</span>
          <button type="button" className="btn" onClick={() => setPath((p) => (p + 1) % nSims)} aria-label="Next future">→</button>
          <button type="button" className="btn" onClick={() => setPath(Math.floor(Math.random() * nSims))}>Random</button>
          <button type="button" className="btn btn-primary play" onClick={play}>{playing ? "Pause" : "Play"}</button>
        </div>
      </div>

      {data && (
        <p className="replay-summary">
          This future: old machine {failText} · value created <b>IDR {fmt.bn(data.npv)} B</b> · better than {fmt.pct(data.betterThan)} of futures
        </p>
      )}

      <div className="replay-body">
        <div className="stack" ref={stackRef} onPointerMove={onMove} onPointerDown={onMove}>
          {ready && (
            <>
              <Track cursorX={cx} title="Panels in the store (m²)"
                legend={<span>dashed: run below {fmt.int(cfg.reorder_s)}, stop at {fmt.int(cfg.order_up_to_S)} · grey: no machine</span>}>
                <StockChart d={data} w={w} cfg={cfg} />
              </Track>
              <Track cursorX={cx} title="What the day crew did"
                legend={<><span><i className="swatch c-belt" />machine</span><span><i className="swatch c-hand" />hand panels</span><span><i className="swatch c-idle" />nothing to do</span><span><i className="swatch c-down" />no machine</span></>}>
                <CrewStrip d={data} w={w} />
              </Track>
              <Track cursorX={cx} title="Project delivery time quoted (days)">
                <LeadChart d={data} w={w} cfg={cfg} />
              </Track>
              <Track cursorX={cx} title="Profit each month (IDR million)"
                legend={<><span><i className="swatch c-accent" />this future</span><span><i className="swatch c-band" />typical range</span></>}>
                <ProfitChart d={data} w={w} />
              </Track>
              <Track cursorX={cx} title="Customers kept"
                legend={<><span><i className="swatch c-belt" />builders</span><span><i className="swatch c-hand" />project clients</span></>}>
                <LoyaltyChart d={data} w={w} />
              </Track>
            </>
          )}
          {!ready && <p className="loading">Loading this future…</p>}
        </div>
        {ready && <Readout d={data} t={cursor} cfg={cfg} />}
      </div>
    </div>
  );
}
