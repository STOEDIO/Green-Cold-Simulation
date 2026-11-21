import { useRef } from "react";
import { DEFAULTS } from "../sim/core.js";
import { PARAM_GROUPS } from "../params.js";
import { recommended, familyBests, FAMILY_NAME, fmt } from "../lib.js";

const QUICK = [
  ["Builders cut prices by 5%", "A price war on standard panels. Our costs stay the same.", { machine_price_shock: 0.05 }],
  ["Builder orders drop 20%", "A slow year for cold-room builders.", { demand_total_month: 11000 * (1 - 0.6 * 0.2) }],
  ["Old machine breaks early", "It fails within the first 6 months instead of 12.", { fail_max: 6 }],
  ["Wages double", "Operators cost IDR 10 million a month instead of 5.", { wage_month: 10e6 }],
  ["Partners are unreliable", "Only 40 to 50% of partner work arrives on time.", { partner_project_ontime: 0.4, resale_ontime: 0.5 }],
  ["New crew learns slowly", "30% productivity for the first 4 months.", { ramp_months: 4, ramp_productivity: 0.3 }],
  ["Late projects cost builder orders", "Customers who buy both leave faster when projects are late.", { churn_cross: 0.4 }],
  ["More project work", "Projects grow to 55% of demand.", { share_builder: 0.45 }],
];

const KEY_SLIDERS = ["machine_price_shock", "demand_total_month", "share_builder", "fail_max", "wage_month", "partner_project_ontime"];
const ALL = Object.fromEntries(PARAM_GROUPS.flatMap(([, list]) => list.map((p) => [p[0], p])));

function Slider({ def, value, onChange }) {
  const [key, label, min, max, step, format, source] = def;
  const changed = Math.abs(value - DEFAULTS[key]) > 1e-9;
  return (
    <div className={`slider ${changed ? "is-changed" : ""}`}>
      <div className="slider-top">
        <label htmlFor={`p-${key}`}>{label}</label>
        <output htmlFor={`p-${key}`}>{format(value)}</output>
      </div>
      <input id={`p-${key}`} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(key, +e.target.value)} />
      <div className="slider-foot">
        <span>{source === "brief" ? "From the case brief" : "Our estimate"}</span>
        {changed && <button type="button" className="link-btn" onClick={() => onChange(key, DEFAULTS[key])}>reset ({format(DEFAULTS[key])})</button>}
      </div>
    </div>
  );
}

export default function WhatIf({ params, setParams, nSims, setNSims, seed, setSeed, rows, busy, onReset }) {
  const set = (k, v) => setParams((p) => ({ ...p, [k]: v }));
  const isOn = (over) => Object.entries(over).every(([k, v]) => Math.abs(params[k] - v) < 1e-9);
  const toggle = (over) => setParams((p) => {
    const next = { ...p };
    const on = isOn(over);
    for (const [k, v] of Object.entries(over)) next[k] = on ? DEFAULTS[k] : v;
    return next;
  });

  const changed = Object.keys(DEFAULTS).filter((k) => Math.abs(params[k] - DEFAULTS[k]) > 1e-9).length;
  const top = recommended(rows);
  const best = familyBests(rows);
  const baseline = useRef(null);
  if (!changed && !busy) baseline.current = top.E_NPV_bn;
  const winner = Object.entries(best).sort((a, b) => b[1].E_NPV_bn - a[1].E_NPV_bn)[0];
  const diff = baseline.current != null ? winner[1].E_NPV_bn - baseline.current : 0;

  return (
    <div className="whatif">
      <div className="quick" role="group" aria-label="Quick what-ifs">
        {QUICK.map(([name, help, over]) => (
          <button key={name} type="button" className="quick-btn" aria-pressed={isOn(over)} onClick={() => toggle(over)}>
            <b>{name}</b>
            <span>{help}</span>
          </button>
        ))}
      </div>

      <div className={`result ${busy ? "is-busy" : ""}`} aria-live="polite">
        {busy ? (
          <p>Updating…</p>
        ) : (
          <>
            <p className="result-main">
              {changed ? "With your changes, " : "In our base case, "}
              <b>{FAMILY_NAME[winner[0]]}</b> earns the most: <b>IDR {fmt.bn1(winner[1].E_NPV_bn)} billion</b>
              {changed > 0 && baseline.current != null && (
                <span className="muted"> ({diff >= 0 ? "+" : ""}{fmt.bn1(diff)} compared with our base case)</span>
              )}.
            </p>
            <p className="result-sub">
              Hand hall {fmt.bn1(best.Hand.E_NPV_bn)} · Machine only {fmt.bn1(best.Machine.E_NPV_bn)} · Split by rule {fmt.bn1(best.Split.E_NPV_bn)}.
              {" "}{winner[0] === "Split" ? "Our recommendation still wins." : "Here our recommendation would no longer win, so this is a situation to watch."}
            </p>
            {changed > 0 && <button type="button" className="btn" onClick={onReset}>Clear all changes</button>}
          </>
        )}
      </div>

      <h3 className="sub-head">Or change the key numbers yourself</h3>
      <div className="sliders">
        {KEY_SLIDERS.map((k) => <Slider key={k} def={ALL[k]} value={params[k]} onChange={set} />)}
      </div>

      <details className="more">
        <summary>All assumptions ({Object.keys(ALL).length})</summary>
        <p className="muted">The case brief gives only a few figures (Table 1). Everything marked "Our estimate" is our assumption, and you can change it.</p>
        {PARAM_GROUPS.map(([group, list]) => (
          <fieldset key={group} className="param-group">
            <legend>{group}</legend>
            <div className="sliders">
              {list.map((def) => <Slider key={def[0]} def={def} value={params[def[0]]} onChange={set} />)}
            </div>
          </fieldset>
        ))}
        <fieldset className="param-group">
          <legend>Simulation settings</legend>
          <div className="sliders">
            <div className="slider">
              <div className="slider-top"><label htmlFor="p-n">Number of simulated futures</label><output>{nSims}</output></div>
              <input id="p-n" type="range" min="100" max="1000" step="50" value={nSims} onChange={(e) => setNSims(+e.target.value)} />
              <div className="slider-foot"><span>More is more precise but slower</span></div>
            </div>
            <div className="slider">
              <div className="slider-top"><label htmlFor="p-seed">Random seed</label><output>{seed}</output></div>
              <input id="p-seed" type="range" min="1" max="99" step="1" value={seed} onChange={(e) => setSeed(+e.target.value)} />
              <div className="slider-foot"><span>Draws a different set of futures</span></div>
            </div>
          </div>
        </fieldset>
      </details>
    </div>
  );
}
