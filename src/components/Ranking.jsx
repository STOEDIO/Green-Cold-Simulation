import { useMemo } from "react";
import { OBJECTIVES, scoreWith } from "../sim/core.js";
import { FAMILY_NAME, shortDescribe, fmt } from "../lib.js";

export default function Ranking({ rows, weights, onInspect }) {
  const total = OBJECTIVES.reduce((s, k) => s + weights[k], 0) || 1;
  const norm = Object.fromEntries(OBJECTIVES.map((k) => [k, weights[k] / total]));
  const key = JSON.stringify(norm);
  const ranked = useMemo(() => {
    const sc = scoreWith(rows, norm);
    return rows.map((r, i) => ({ r, s: sc[i] })).sort((a, b) => b.s - a.s).slice(0, 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, key]);
  const max = ranked[0].s || 1;

  return (
    <div className="table-wrap">
      <table className="rank-table">
        <thead>
          <tr>
            <th className="num">#</th><th>Option</th>
            <th className="num">Value, IDR B</th><th className="num">Bad year</th><th className="num">On time</th><th className="num">Served</th><th>Score</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map(({ r, s }, i) => (
            <tr key={r.id} className="clickable" onClick={() => onInspect(r.id)} title="Show on the All options chart">
              <td className="num">{i + 1}</td>
              <td><span className="opt-cell"><i className={`swatch ${r.family}`} /><span><b>{FAMILY_NAME[r.family].slice(3)}</b><br /><span className="muted">{shortDescribe(r)}</span></span></span></td>
              <td className="num">{fmt.bn1(r.E_NPV_bn)}</td>
              <td className="num">{fmt.bn1(r.CVaR5_NPV_bn)}</td>
              <td className="num">{fmt.pct(r.weakest_side_ontime)}</td>
              <td className="num">{fmt.pct(r.coverage)}</td>
              <td><span className="score"><span className="score-bar" style={{ width: `${(s / max) * 70}px` }} />{(s * 100).toFixed(0)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
