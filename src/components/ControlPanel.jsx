import { DEFAULTS, OBJECTIVES, PROFILES } from "../sim/core.js";
import { PARAM_GROUPS } from "../params.js";

export const SITUATIONS = [
  ["Builders cut prices 5%", { machine_price_shock: 0.05 }],
  ["Builder orders fall 20%", { demand_total_month: 11000 * (1 - 0.6 * 0.2) }],
  ["Old machine breaks early", { fail_max: 6 }],
  ["Wages double", { wage_month: 10e6 }],
  ["Partners unreliable", { partner_project_ontime: 0.4, resale_ontime: 0.5 }],
  ["New crew learns slowly", { ramp_months: 4, ramp_productivity: 0.3 }],
  ["Late projects cost builders", { churn_cross: 0.4 }],
  ["More project work (55%)", { share_builder: 0.45 }],
];
const KEY = ["machine_price_shock", "demand_total_month", "share_builder", "fail_max", "wage_month", "partner_project_ontime"];
const ALL = Object.fromEntries(PARAM_GROUPS.flatMap(([, list]) => list.map((p) => [p[0], p])));
const PRIORITIES = [["Profit-first", "Profit"], ["Risk-averse", "Safety"], ["Neither-side-lost", "Both customers"], ["Coverage-first", "Reach"]];
const MEASURE = { E_NPV_bn: "Value", CVaR5_NPV_bn: "Bad-year value", weakest_side_ontime: "On time", coverage: "Orders served" };

function Slider({ def, value, onChange }) {
  const [key, label, min, max, step, format, source] = def;
  const changed = Math.abs(value - DEFAULTS[key]) > 1e-9;
  return (
    <div className={`slider ${changed ? "is-changed" : ""}`}>
      <div className="slider-top">
        <label htmlFor={`p-${key}`} title={source === "brief" ? "From the case brief" : "Our estimate"}>
          {label}{source === "brief" && <sup className="src">brief</sup>}
        </label>
        <output htmlFor={`p-${key}`}>{format(value)}</output>
      </div>
      <div className="slider-row">
        <input id={`p-${key}`} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(key, +e.target.value)} />
        <button type="button" className="undo" aria-label={`Reset ${label}`} title="Reset" disabled={!changed} onClick={() => onChange(key, DEFAULTS[key])}>↺</button>
      </div>
    </div>
  );
}

export default function ControlPanel({ params, setParams, nSims, setNSims, seed, setSeed, priority, setPriority, weights, setWeights, changes, onReset }) {
  const set = (k, v) => setParams((p) => ({ ...p, [k]: v }));
  const isOn = (over) => Object.entries(over).every(([k, v]) => Math.abs(params[k] - v) < 1e-9);
  const toggle = (over) => setParams((p) => {
    const on = isOn(over), next = { ...p };
    for (const [k, v] of Object.entries(over)) next[k] = on ? DEFAULTS[k] : v;
    return next;
  });
  const total = OBJECTIVES.reduce((s, k) => s + weights[k], 0) || 1;

  return (
    <aside className="controls" aria-label="Simulation settings">
      <div className="ctl-block">
        <div className="ctl-head"><h2>Situation</h2>{changes > 0 && <button type="button" className="link-btn" onClick={onReset}>Reset all</button>}</div>
        <div className="toggles">
          {SITUATIONS.map(([name, over]) => (
            <button key={name} type="button" className="toggle" aria-pressed={isOn(over)} onClick={() => toggle(over)}>{name}</button>
          ))}
        </div>
      </div>

      <div className="ctl-block">
        <h2>Key numbers</h2>
        {KEY.map((k) => <Slider key={k} def={ALL[k]} value={params[k]} onChange={set} />)}
        <details className="ctl-more">
          <summary>More assumptions</summary>
          {PARAM_GROUPS.map(([group, list]) => {
            const rest = list.filter((d) => !KEY.includes(d[0]));
            if (!rest.length) return null;
            return (
              <div key={group} className="ctl-group">
                <h3>{group}</h3>
                {rest.map((def) => <Slider key={def[0]} def={def} value={params[def[0]]} onChange={set} />)}
              </div>
            );
          })}
          <div className="ctl-group">
            <h3>Simulation</h3>
            <div className="slider">
              <div className="slider-top"><label htmlFor="p-n">Futures simulated</label><output>{nSims}</output></div>
              <input id="p-n" type="range" min="100" max="1000" step="50" value={nSims} onChange={(e) => setNSims(+e.target.value)} />
            </div>
            <div className="slider">
              <div className="slider-top"><label htmlFor="p-seed">Random seed</label><output>{seed}</output></div>
              <input id="p-seed" type="range" min="1" max="99" step="1" value={seed} onChange={(e) => setSeed(+e.target.value)} />
            </div>
          </div>
        </details>
      </div>

      <div className="ctl-block">
        <h2>Ranking priority</h2>
        <div className="seg seg-full">
          {PRIORITIES.map(([k, n]) => (
            <button key={k} type="button" aria-pressed={priority === k} onClick={() => { setPriority(k); setWeights(PROFILES[k]); }}>{n}</button>
          ))}
        </div>
        <details className="ctl-more">
          <summary>{priority ? "Custom weights" : "Custom weights (in use)"}</summary>
          {OBJECTIVES.map((k) => (
            <div key={k} className="slider">
              <div className="slider-top"><label htmlFor={`w-${k}`}>{MEASURE[k]}</label><output>{Math.round((weights[k] / total) * 100)}%</output></div>
              <input id={`w-${k}`} type="range" min="0" max="100" value={Math.round(weights[k] * 100)}
                onChange={(e) => { setPriority(null); setWeights({ ...weights, [k]: +e.target.value / 100 }); }} />
            </div>
          ))}
        </details>
      </div>
    </aside>
  );
}
