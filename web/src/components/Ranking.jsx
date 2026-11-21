import { useMemo, useState } from "react";
import { OBJECTIVES, PROFILES, scoreWith } from "../sim/core.js";
import { FAMILY_NAME, shortDescribe, fmt } from "../lib.js";

const MEASURE = {
  E_NPV_bn: ["Profit", "average value created"],
  CVaR5_NPV_bn: ["Safety", "value in a bad year"],
  weakest_side_ontime: ["Service", "on-time delivery for the weaker customer group"],
  coverage: ["Reach", "share of all orders served"],
};
const PRIORITY = {
  "Profit-first": ["Profit first", "The owner wants the highest return."],
  "Risk-averse": ["Play it safe", "The owner can't afford a bad year."],
  "Neither-side-lost": ["Keep both customer groups", "Neither builders nor project clients get neglected."],
  "Coverage-first": ["Serve every order", "Market presence matters more than margin."],
};

export default function Ranking({ rows, onInspect }) {
  const [profile, setProfile] = useState("Profit-first");
  const [weights, setWeights] = useState(PROFILES["Profit-first"]);
  const total = OBJECTIVES.reduce((s, k) => s + weights[k], 0) || 1;
  const norm = Object.fromEntries(OBJECTIVES.map((k) => [k, weights[k] / total]));

  const ranked = useMemo(() => {
    const sc = scoreWith(rows, norm);
    return rows.map((r, i) => ({ r, s: sc[i] })).sort((a, b) => b.s - a.s);
  }, [rows, JSON.stringify(norm)]);
  const topTen = ranked.slice(0, 10);
  const max = topTen[0].s || 1;

  const robust = rows.slice().sort((a, b) => a.avg_rank_profiles - b.avg_rank_profiles).slice(0, 8);

  return (
    <div className="ranking">
      <div className="priorities" role="group" aria-label="Priorities">
        {Object.entries(PRIORITY).map(([k, [name, help]]) => (
          <button key={k} type="button" className="quick-btn" aria-pressed={profile === k}
            onClick={() => { setProfile(k); setWeights(PROFILES[k]); }}>
            <b>{name}</b><span>{help}</span>
          </button>
        ))}
      </div>

      <details className="more">
        <summary>{profile ? "Fine-tune the balance" : "Your own balance"}</summary>
        <div className="weights">
          {OBJECTIVES.map((k) => (
            <div key={k} className="slider">
              <div className="slider-top">
                <label htmlFor={`w-${k}`}>{MEASURE[k][0]} <span className="muted">({MEASURE[k][1]})</span></label>
                <output>{Math.round(norm[k] * 100)}%</output>
              </div>
              <input id={`w-${k}`} type="range" min="0" max="100" value={Math.round(weights[k] * 100)}
                onChange={(e) => { setProfile(null); setWeights({ ...weights, [k]: +e.target.value / 100 }); }} />
            </div>
          ))}
        </div>
      </details>

      <div className="table-wrap">
        <table className="rank-table">
          <thead>
            <tr><th className="num">Place</th><th>Option</th><th className="num">Profit</th><th className="num">Bad year</th><th className="num">Service</th><th className="num">Reach</th><th>Score</th></tr>
          </thead>
          <tbody>
            {topTen.map(({ r, s }, i) => (
              <tr key={r.id} className="clickable" onClick={() => onInspect(r.id)} title="Show this option on the chart">
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
      <p className="muted small">Profit and bad year in IDR billion. Score is out of 100. Click a row to find it on the chart above.</p>

      <h3 className="sub-head">Which options stay near the top whatever the priority?</h3>
      <p className="how">Each number is the option's place out of 152 under that priority. Darker means closer to first.</p>
      <div className="table-wrap">
        <table className="heat">
          <thead>
            <tr><th>Option</th>{Object.keys(PROFILES).map((k) => <th key={k} className="num">{PRIORITY[k][0]}</th>)}</tr>
          </thead>
          <tbody>
            {robust.map((r) => (
              <tr key={r.id} className="clickable" onClick={() => onInspect(r.id)}>
                <td><span className="opt-cell"><i className={`swatch ${r.family}`} /><span className="muted">{shortDescribe(r)}</span></span></td>
                {Object.keys(PROFILES).map((k) => {
                  const v = r[`rank_${k}`], a = Math.max(0, 0.32 - (v - 1) / 60);
                  return <td key={k} className="num heat-cell" style={{ background: `color-mix(in srgb, var(--accent) ${Math.round(a * 100)}%, transparent)` }}>{v}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
