import { recommended, familyBests, fmt } from "../lib.js";

function PanelDrawing() {
  return (
    <figure className="panel-fig">
      <svg viewBox="0 0 600 70" preserveAspectRatio="none" className="panel-svg" aria-hidden="true">
        <defs>
          <pattern id="foam" width="12" height="12" patternUnits="userSpaceOnUse">
            <rect width="12" height="12" fill="var(--core)" />
            <circle cx="3" cy="4" r="1.4" fill="var(--core-dot)" />
            <circle cx="9" cy="9" r="1.9" fill="var(--core-dot)" opacity=".7" />
          </pattern>
        </defs>
        <rect x="0" y="4" width="600" height="5" fill="var(--steel)" />
        <rect x="0" y="9" width="600" height="52" fill="url(#foam)" />
        <rect x="0" y="61" width="600" height="5" fill="var(--steel)" />
      </svg>
      <figcaption>
        A sandwich panel: two steel skins around an insulating core. The machine makes standard 1,150 mm panels fast.
        Odd sizes, rock-wool cores, curves and pipe holes can only be made by hand.
      </figcaption>
    </figure>
  );
}

export default function ReadPage({ rows, nSims, onTry }) {
  const top = rows && recommended(rows);
  const best = rows && familyBests(rows);

  return (
    <main className="read">
      <p className="kicker">Team STOEDIO · Bosshire × PPIT Xiamen Business Case Competition 2026</p>
      <h1>Machine first, by rule</h1>

      <section>
        <h2>The question</h2>
        <p>
          PT Green Cold's panel machine is worn out. The owner can fund a new machine (IDR 3.5 billion) or a hand-building hall
          (IDR 2.2 billion), not both. One crew of eight can run the machine or build by hand, but not both on the same day.
          60% of demand is builders buying standard panels; 40% is project work only hand-building can do.
        </p>
        <PanelDrawing />
      </section>

      <section>
        <h2>Our answer</h2>
        <div className="answer">
          <p>
            <b>Buy the new machine</b> for builder orders. Keep building project panels by hand on days the machine isn't needed
            and with a second-shift crew, and send overflow to partners. A written rule decides which order goes where.
          </p>
        </div>
        {top && (
          <ul className="tight">
            <li>Highest value created: <b>IDR {fmt.bn1(top.E_NPV_bn)} B</b>, against {fmt.bn1(best.Hand.E_NPV_bn)} (hand hall) and {fmt.bn1(best.Machine.E_NPV_bn)} (machine only).</li>
            <li>Safest: <b>IDR {fmt.bn1(top.CVaR5_NPV_bn)} B</b> even in a bad year.</li>
            <li>Weak spot: only <b>{fmt.pct(top.project_ontime)}</b> of projects arrive within 12 days.</li>
          </ul>
        )}
      </section>

      <section>
        <h2>How the simulation works</h2>
        <p>
          It is a Monte Carlo simulation: instead of one forecast, we play out many possible futures and look at the whole range
          of results.
        </p>
        <ol className="tight">
          <li><b>152 options.</b> Every sensible way to run the plant: which investment, how many crews, how much stock, whether to use partners.</li>
          <li><b>{nSims} futures.</b> Each has its own random order pattern, project sizes and the month the old machine breaks.</li>
          <li><b>Day by day.</b> Each option plays out each future for 24 months: what the crew works on, stock, waiting times, profit, and customers leaving after late orders.</li>
          <li><b>Scoring.</b> We average the results and score each option on value, risk, service and reach.</li>
        </ol>
        <p className="note">Every option faces the same futures, so a difference between options comes from the option, not luck.</p>
      </section>

      <section>
        <h2>How to use the simulator</h2>
        <ol className="tight">
          <li>Pick a situation, such as "Wages double", or move a number in the left-hand panel.</li>
          <li>Read the headline at the top: which option earns the most now.</li>
          <li>Switch views to see the detail: Overview, Day by day, All options, Ranking, Stress tests.</li>
          <li>Press "Reset" to go back to our base case.</li>
        </ol>
      </section>

      <section>
        <h2>Terms</h2>
        <dl className="terms">
          <div><dt>Value created</dt><dd>Profit over 24 months in today's money, minus the investment (net present value at 12% a year). Average of all futures.</dd></div>
          <div><dt>Value in a bad year</dt><dd>Average of the worst 5% of futures.</dd></div>
          <div><dt>On time</dt><dd>Builders within 5 days, projects within 12 days, as the brief promises.</dd></div>
          <div><dt>Customers kept</dt><dd>Share of demand still buying after 2 years. Late or missing orders drive customers away.</dd></div>
          <div><dt>Best trade-offs</dt><dd>Options no other option beats on all four scores at once.</dd></div>
          <div><dt>Priority</dt><dd>How much weight the ranking gives to value, risk, service and reach.</dd></div>
        </dl>
      </section>

      <section>
        <h2>Where the numbers come from</h2>
        <p>
          Table 1 of the case brief is the only source of figures; those settings are tagged BRIEF in the simulator. Everything
          else, such as price, wages and how fast customers leave, is our estimate. Figures are gross profit before overheads and tax.
        </p>
      </section>

      <button type="button" className="btn btn-primary btn-lg" onClick={onTry}>Open the simulator</button>
    </main>
  );
}
