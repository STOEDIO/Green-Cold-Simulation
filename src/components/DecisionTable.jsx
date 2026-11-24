import { useMemo } from "react";
import { FAMILIES, FAMILY_NAME, familyBests, recommended, describe, fmt } from "../lib.js";

const OPTION_SUMMARY = {
  Machine: "New machine, projects to a partner",
  Hand: "Hand hall, old machine until it breaks",
  Split: "New machine + hand work on spare days and 2nd shift",
};

// Service targets from the deck (slide 7): ✓ meets, ! within 15 points, ✕ further off.
function status(v, target) {
  if (v >= target - 1e-9) return ["ok", "✓"];
  if (v >= target - 0.15) return ["near", "!"];
  return ["off", "✕"];
}

// [label, getter, formatter, "high" | "low" | null = which is better, service target]
const LINES = [
  ["Investment, IDR B", (r) => r.capex_bn, fmt.bn1, null],
  ["Value created, IDR B", (r) => r.E_NPV_bn, fmt.bn1, "high"],
  ["Bad-luck value (worst 1 in 20 futures), IDR B", (r) => r.CVaR5_NPV_bn, fmt.bn1, "high"],
  ["Chance of losing money", (r) => r.P_NPV_below_0, fmt.pct, "low"],
  ["Builder orders on time", (r) => r.builder_ontime, fmt.pct1, null, 0.98],
  ["Project orders on time", (r) => r.project_ontime, fmt.pct, null, 0.8],
  ["Builder clients kept", (r) => r.builder_retention_end, fmt.pct, null, 0.8],
  ["Project clients kept", (r) => r.project_retention_end, fmt.pct, null, 0.8],
  ["Project work sent to partners", (r) => r.partner_share, fmt.pct, null],
  ["Average rank of 152, four weightings", (r) => r.avg_rank_profiles, (v) => Math.round(v), "low"],
];

function Kpis({ rows, getKpis, version }) {
  const top = recommended(rows);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const k = useMemo(() => getKpis(top.id), [version, top.id, getKpis]);
  if (!k) return null;
  const items = [
    ["Builder orders on time", "≥ 98%", top.builder_ontime >= 0.98, fmt.pct1(top.builder_ontime), "against the 5-day promise"],
    ["Project orders on time", "≥ 90%", top.project_ontime >= 0.9, fmt.pct(top.project_ontime), `against the 12-day promise; worst month ${fmt.pct(k.worstMonthProjectOntime)}`],
    ["Monthly gross profit", "≥ IDR 680M", k.gpFromMonth7 >= 680, `IDR ${Math.round(k.gpFromMonth7)}M`, "average from month 7"],
    ["Project m² sent to partners", "≤ 40%", top.partner_share <= 0.4, fmt.pct(top.partner_share), "is the other panel slipping away?"],
  ];
  return (
    <section className="kpis" aria-label="Quarterly review">
      <h3>Quarterly review: the four numbers the owner checks <span className="muted">(our recommendation)</span></h3>
      <div className="kpi-grid">
        {items.map(([name, target, ok, value, note]) => (
          <div key={name} className="kpi">
            <span className="kpi-name">{name}</span>
            <span className="kpi-value num">{value}</span>
            <span className={`kpi-target ${ok ? "ok" : "off"}`}>{ok ? "✓" : "✕"} target {target}</span>
            <span className="kpi-note">{note}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function DecisionTable({ rows, getKpis, version }) {
  const best = familyBests(rows);
  return (
    <>
      <div className="table-wrap">
        <table className="compare">
          <thead>
            <tr>
              <th scope="col"><span className="sr">Measure</span></th>
              {FAMILIES.map((f) => (
                <th key={f} scope="col" className="opt-head">
                  <span className="opt-name"><i className={`swatch ${f}`} />{FAMILY_NAME[f]}</span>
                  <span className="opt-sum">{OPTION_SUMMARY[f]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LINES.map(([label, get, f, better, target]) => {
              const vals = FAMILIES.map((x) => get(best[x]));
              let win = better === "high" ? Math.max(...vals) : better === "low" ? Math.min(...vals) : null;
              if (win != null && vals.filter((v) => f(v) === f(win)).length > 1) win = null; // a tie has no winner
              return (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  {vals.map((v, i) => {
                    const st = target != null ? status(v, target) : null;
                    return (
                      <td key={i} className={`num ${v === win ? "is-best" : ""}`}>
                        {st && <span className={`mark mark-${st[0]}`} aria-hidden="true">{st[1]}</span>}
                        {f(v)}
                        {v === win && <span className="best-mark">best</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="table-foot">
        <span className="mark mark-ok">✓</span> meets target <span className="mark mark-near">!</span> within 15 points <span className="mark mark-off">✕</span> further off.
        Targets: builders 98% on time, projects 80% on time, 80% of clients kept.
      </p>
      <Kpis rows={rows} getKpis={getKpis} version={version} />
      <details className="more">
        <summary>Which combination of each option?</summary>
        <ul>
          {FAMILIES.map((f) => <li key={f}><b>{FAMILY_NAME[f]}:</b> {describe(best[f])}.</li>)}
        </ul>
      </details>
    </>
  );
}
