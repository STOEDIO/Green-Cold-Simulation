import { FAMILIES, FAMILY_NAME, familyBests, overallRank, describe, fmt } from "../lib.js";

const OPTION_SUMMARY = {
  Machine: "Buy the new machine, keep popular sizes in stock, send all project work to a partner.",
  Hand: "Build the hand hall with up to two new crews, run the old machine until it breaks.",
  Split: "Buy the new machine for builders, build project panels by hand on spare days and a second shift, partners for overflow.",
};

// [label, plain explanation, getter, formatter, which direction is better]
const LINES = [
  ["Investment", "IDR billion, paid up front", (r) => r.capex_bn, fmt.bn1, null],
  ["Value created over 2 years", "IDR billion, average of all futures, after the investment", (r) => r.E_NPV_bn, fmt.bn1, "high"],
  ["Value in a bad year", "IDR billion, average of the worst 5% of futures", (r) => r.CVaR5_NPV_bn, fmt.bn1, "high"],
  ["Chance of losing money", "share of futures where value created is below zero", (r) => r.P_NPV_below_0, fmt.pct, "low"],
  ["Builder orders on time", "delivered within the 5-day promise", (r) => r.builder_ontime, fmt.pct, "high"],
  ["Project orders on time", "delivered within the 12-day promise", (r) => r.project_ontime, fmt.pct, "high"],
  ["Builders still with us after 2 years", "share of builder demand kept; late or missing orders drive customers away", (r) => r.builder_retention_end, fmt.pct, "high"],
  ["Project clients still with us", "share of project demand kept", (r) => r.project_retention_end, fmt.pct, "high"],
  ["Overall position", "out of 152 options, across four different priorities", null, null, "low"],
];

export default function DecisionTable({ rows }) {
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
            {LINES.map(([label, help, get, f, better]) => {
              const vals = FAMILIES.map((x) => (get ? get(best[x]) : overallRank(rows, best[x])));
              let target = better === "high" ? Math.max(...vals) : better === "low" ? Math.min(...vals) : null;
              if (target != null && vals.filter((v) => f ? f(v) === f(target) : v === target).length > 1) target = null; // a tie has no winner
              return (
                <tr key={label}>
                  <th scope="row">{label}<span className="row-help">{help}</span></th>
                  {vals.map((v, i) => (
                    <td key={i} className={`num ${v === target ? "is-best" : ""}`}>
                      {get ? f(v) : `#${v}`}
                      {v === target && <span className="best-mark">best</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <details className="more">
        <summary>Exactly which version of each option is shown here?</summary>
        <ul>
          {FAMILIES.map((f) => <li key={f}><b>{FAMILY_NAME[f]}:</b> {describe(best[f])}.</li>)}
        </ul>
        <p className="muted">The stock rule "500/1,500 m²" means: start a machine run when stock falls below 500 m², stop when it reaches 1,500 m².</p>
      </details>
    </>
  );
}
