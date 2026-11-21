import { useState } from "react";
import { FAMILIES, FAMILY_NAME, FAMILY_COLOR, recommended, overallRank, describe, scale, ticks, useWidth, fmt } from "../lib.js";

const Y_OPTIONS = {
  CVaR5_NPV_bn: ["Value in a bad year (IDR billion)", fmt.bn1],
  weakest_side_ontime: ["On-time delivery, weaker customer group", fmt.pct],
  project_ontime: ["Project orders on time", fmt.pct],
  builder_ontime: ["Builder orders on time", fmt.pct],
  coverage: ["Share of all orders served", fmt.pct],
  builder_retention_end: ["Builders still with us after 2 years", fmt.pct],
  project_retention_end: ["Project clients still with us after 2 years", fmt.pct],
};

function Spread({ r, top, w }) {
  const list = r.id === top.id ? [[r, "this option"]] : [[r, "this option"], [top, "our recommendation"]];
  const lo = Math.min(...list.map(([x]) => x.hist[2])), hi = Math.max(...list.map(([x]) => x.hist[38]));
  const pad = (hi - lo) * 0.08 || 0.5;
  const h = 26 + list.length * 40, x = scale(lo - pad, hi + pad, 8, w - 8);
  return (
    <svg width={w} height={h} className="chart">
      {ticks(lo - pad, hi + pad, 5).map((v) => (
        <g key={v}><line x1={x(v)} x2={x(v)} y1={4} y2={h - 18} className="grid" /><text x={x(v)} y={h - 4} textAnchor="middle">{fmt.bn1(v)}</text></g>
      ))}
      {list.map(([o, name], i) => {
        const yy = 28 + i * 40, q = o.hist;
        return (
          <g key={name}>
            <text x={x(q[2])} y={yy - 12} className="label">{name}</text>
            <line x1={x(q[2])} x2={x(q[38])} y1={yy} y2={yy} stroke={FAMILY_COLOR[o.family]} strokeWidth="2" />
            <rect x={x(q[10])} y={yy - 7} width={Math.max(2, x(q[30]) - x(q[10]))} height={14} rx={3} fill={FAMILY_COLOR[o.family]} opacity=".35" />
            <line x1={x(q[20])} x2={x(q[20])} y1={yy - 9} y2={yy + 9} className="median" />
          </g>
        );
      })}
    </svg>
  );
}

export default function Explorer({ rows, selectedId, onSelect, onReplay }) {
  const [yKey, setYKey] = useState("weakest_side_ontime");
  const [on, setOn] = useState({ Machine: true, Hand: true, Split: true });
  const [hover, setHover] = useState(null);
  const [ref, w] = useWidth();
  const [dref, dw] = useWidth();
  const top = recommended(rows);
  const sel = rows.find((r) => r.id === selectedId) || top;

  const h = Math.min(460, Math.max(320, w * 0.62)), Lm = 54, Rm = 16, Tm = 14, Bm = 42;
  const ext = (k) => {
    const v = rows.map((r) => r[k]); const lo = Math.min(...v), hi = Math.max(...v), p = (hi - lo) * 0.06 || 0.01;
    return [lo - p, hi + p];
  };
  const [x0, x1] = ext("E_NPV_bn"), [y0, y1] = ext(yKey);
  const x = scale(x0, x1, Lm, w - Rm), y = scale(y0, y1, h - Bm, Tm);
  const order = rows.slice().sort((a, b) => (a.pareto_level === 1) - (b.pareto_level === 1));

  return (
    <div className="explorer">
      <div className="explorer-chart">
        <div className="explorer-controls">
          <label htmlFor="ykey">Compare value created with</label>
          <select id="ykey" value={yKey} onChange={(e) => setYKey(e.target.value)}>
            {Object.entries(Y_OPTIONS).map(([k, [n]]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </div>
        <div className="legend legend-toggles">
          {FAMILIES.map((f) => (
            <label key={f}><input type="checkbox" checked={on[f]} onChange={(e) => setOn({ ...on, [f]: e.target.checked })} /><i className={`swatch ${f}`} />{FAMILY_NAME[f]}</label>
          ))}
          <span><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>best trade-offs</span>
        </div>
        <div ref={ref} className="scatter-box" onPointerLeave={() => setHover(null)}>
          {w > 0 && (
            <svg width={w} height={h} className="chart">
              {ticks(x0, x1, 6).map((v) => (
                <g key={v}><line x1={x(v)} x2={x(v)} y1={Tm} y2={h - Bm} className="grid" /><text x={x(v)} y={h - Bm + 16} textAnchor="middle">{fmt.bn1(v)}</text></g>
              ))}
              {ticks(y0, y1, 5).map((v) => (
                <g key={v}><line x1={Lm} x2={w - Rm} y1={y(v)} y2={y(v)} className="grid" /><text x={Lm - 8} y={y(v) + 4} textAnchor="end">{Y_OPTIONS[yKey][1](v)}</text></g>
              ))}
              <text x={w - Rm} y={h - 6} textAnchor="end" className="label">Value created over 2 years, IDR billion →</text>
              <text x={Lm + 4} y={Tm + 12} className="label">↑ {Y_OPTIONS[yKey][0]}</text>
              {order.filter((r) => on[r.family]).map((r) => {
                const cx = x(r.E_NPV_bn), cy = y(r[yKey]);
                return (
                  <g key={r.id} className="dot" tabIndex={0} role="button" aria-label={`${FAMILY_NAME[r.family]}: ${describe(r)}`}
                    onClick={() => onSelect(r.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(r.id); } }}
                    onPointerEnter={() => setHover({ r, cx, cy })}>
                    <circle cx={cx} cy={cy} r={13} fill="transparent" />
                    {r.pareto_level === 1 && <circle cx={cx} cy={cy} r={9} className="ring" />}
                    {r.id === sel.id && <circle cx={cx} cy={cy} r={12.5} className="ring-sel" />}
                    <circle cx={cx} cy={cy} r={5.5} fill={FAMILY_COLOR[r.family]} className="dot-fill" />
                  </g>
                );
              })}
              {on[top.family] && (
                <text x={x(top.E_NPV_bn) - 16} y={y(top[yKey]) - 12} textAnchor="end" className="label strong halo">our recommendation</text>
              )}
            </svg>
          )}
          {hover && (
            <div className="hover-card" style={{ left: Math.min(hover.cx + 14, w - 250), top: Math.max(0, hover.cy - 70) }}>
              <b>{FAMILY_NAME[hover.r.family]}</b>, #{overallRank(rows, hover.r)} of 152
              <span>Value created IDR {fmt.bn1(hover.r.E_NPV_bn)} B · {Y_OPTIONS[yKey][0].toLowerCase()}: {Y_OPTIONS[yKey][1](hover.r[yKey])}</span>
              <span className="muted">Click for details</span>
            </div>
          )}
        </div>
      </div>

      <aside className="detail" ref={dref}>
        <p className="detail-fam"><i className={`swatch ${sel.family}`} />{FAMILY_NAME[sel.family]} · #{overallRank(rows, sel)} of 152</p>
        <p className="detail-desc">{describe(sel)}.</p>
        <dl className="kv">
          <div><dt>Value created, average</dt><dd>IDR {fmt.bn1(sel.E_NPV_bn)} B</dd></div>
          <div><dt>Value in a bad year</dt><dd>IDR {fmt.bn1(sel.CVaR5_NPV_bn)} B</dd></div>
          <div><dt>Builder / project on time</dt><dd>{fmt.pct(sel.builder_ontime)} / {fmt.pct(sel.project_ontime)}</dd></div>
          <div><dt>Orders served</dt><dd>{fmt.pct(sel.coverage)}</dd></div>
          <div><dt>Customers kept after 2 years</dt><dd>{fmt.pct(sel.builder_retention_end)} / {fmt.pct(sel.project_retention_end)}</dd></div>
        </dl>
        <div>
          <p className="how">Range of value created across all futures (IDR billion). The box holds the middle half of futures; the line spans 90% of them.</p>
          {dw > 0 && <Spread r={sel} top={top} w={dw} />}
        </div>
        <button type="button" className="btn btn-primary" onClick={() => onReplay(sel.id)}>Watch this option play out</button>
      </aside>
    </div>
  );
}
