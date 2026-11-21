import { FAMILIES, FAMILY_NAME, FAMILY_COLOR, fmt } from "../lib.js";

const PLAIN = {
  "Base case": "Nothing goes wrong (our base case)",
  "No cross-sell churn (γ = 0)": "Late projects never cost us builder orders",
  "Strong cross-sell churn (γ = 0.4)": "Late projects cost us many builder orders",
  "Builder price war (−5% price)": "Builders force prices down 5%",
  "Builders −20% demand": "Builder orders fall 20%",
  "Slow crew ramp-up (30% for 4 mo)": "New crew takes 4 months to get up to speed",
  "Old line dies early (months 1–6)": "Old machine breaks in the first 6 months",
  "Unreliable partner (40–50% on time)": "Partners deliver on time only 40–50% of the time",
  "Expensive labour (2× wage)": "Wages double",
};

export default function StressTests({ sens, busy }) {
  if (!sens) return <p className="loading">{busy ? "Running the nine tests…" : "No results yet."}</p>;
  const all = sens.flatMap((s) => FAMILIES.map((f) => s.best[f].value));
  const hi = Math.max(...all), lo = Math.min(0, ...all);
  const wins = { Machine: 0, Hand: 0, Split: 0 };
  sens.forEach((s) => { wins[FAMILIES.reduce((a, b) => (s.best[b].value > s.best[a].value ? b : a))]++; });
  const leader = FAMILIES.reduce((a, b) => (wins[b] > wins[a] ? b : a));

  return (
    <>
      <p className="verdict">
        <b>{FAMILY_NAME[leader]}</b> earns the most in <b>{wins[leader]} of 9</b> situations.
      </p>
      <div className="table-wrap">
        <table className="stress">
          <thead>
            <tr>
              <th>If this happens…</th>
              {FAMILIES.map((f) => <th key={f}><span className="opt-name"><i className={`swatch ${f}`} />{FAMILY_NAME[f]}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {sens.map((s) => {
              const vals = FAMILIES.map((f) => s.best[f].value);
              const wi = vals.indexOf(Math.max(...vals));
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">Value created over two years, IDR billion, for the best version of each option. Each test uses 150 simulated futures.</p>
    </>
  );
}
