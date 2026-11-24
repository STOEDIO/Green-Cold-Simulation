import { FAMILIES, FAMILY_NAME, FAMILY_COLOR, fmt } from "../lib.js";

const PLAIN = {
  "Base case": "Base case",
  "No cross-sell churn (γ = 0)": "No cross-selling churn",
  "Strong cross-sell churn (γ = 0.4)": "Strong cross-selling churn",
  "Builder price war (−5% price)": "Builder price war (−5%)",
  "Lower demand (total −12%)": "Lower demand (total −12%)",
  "Slow crew ramp-up (30% for 4 mo)": "Slow crew ramp-up (30% for 4 months)",
  "Old line dies early (months 1–6)": "Old line dies early (months 1–6)",
  "Unreliable partner (40–50% on time)": "Unreliable partner (40–50% on time)",
  "Expensive labour (2× wage)": "Labour costs double",
  "New line late (ready month 8)": "New line late (ready month 8)",
  "Partner capacity capped (600 m²/mo)": "Partner capped at 600 m² a month",
};

export default function StressTests({ sens, busy }) {
  if (!sens) return <p className="loading">{busy ? "Running the nine tests…" : "No results yet."}</p>;
  const all = sens.flatMap((s) => FAMILIES.map((f) => s.best[f].value));
  const hi = Math.max(...all), lo = Math.min(0, ...all);
  const wins = { Machine: 0, Hand: 0, Split: 0 };
  const tests = sens.filter((s) => s.name !== "Base case");
  tests.forEach((s) => { wins[FAMILIES.reduce((a, b) => (s.best[b].value > s.best[a].value ? b : a))]++; });
  const leader = FAMILIES.reduce((a, b) => (wins[b] > wins[a] ? b : a));

  return (
    <>
      <p className="verdict">
        <b>{FAMILY_NAME[leader]}</b> {wins[leader] === tests.length ? <>wins <b>all {tests.length}</b> stress tests</> : <>wins <b>{wins[leader]} of {tests.length}</b> stress tests</>}. Best expected value of each option, IDR B; each test re-runs all 152 combinations over 150 futures.
      </p>
      <div className="table-wrap">
        <table className="stress">
          <thead>
            <tr>
              <th>Scenario</th>
              {FAMILIES.map((f) => <th key={f}><span className="opt-name"><i className={`swatch ${f}`} />{FAMILY_NAME[f]}</span></th>)}
              <th className="num">Lead over next</th>
            </tr>
          </thead>
          <tbody>
            {sens.map((s) => {
              const vals = FAMILIES.map((f) => s.best[f].value);
              const wi = vals.indexOf(Math.max(...vals));
              const [first, second] = vals.slice().sort((a, b) => b - a);
              return (
                <tr key={s.name}>
                  <th scope="row">{PLAIN[s.name] || s.name}</th>
                  {vals.map((v, i) => (
                    <td key={i} title={s.best[FAMILIES[i]].label}>
                      <span className="bar-cell">
                        <span className="hbar" style={{ width: `${Math.max(2, ((v - lo) / (hi - lo)) * 80)}px`, background: FAMILY_COLOR[FAMILIES[i]], opacity: i === wi ? 1 : 0.4 }} />
                        <span className={`num ${i === wi ? "is-best" : ""}`}>{fmt.bn1(v)}</span>
                        {i === wi && <span className="best-mark">best</span>}
                      </span>
                    </td>
                  ))}
                  <td className="num">+{fmt.bn1(first - second)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
