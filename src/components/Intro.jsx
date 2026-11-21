import { recommended, familyBests, fmt } from "../lib.js";

// Cross-section of a sandwich panel. The drawing has no text in it; the labels are
// ordinary HTML below, so they stay readable at any screen width.
function PanelDrawing() {
  return (
    <figure className="panel-fig">
      <div className="panel-dim"><span>1,150 mm wide on the machine; any width by hand</span></div>
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
        <span><i className="key key-steel" />Steel skin, top and bottom</span>
        <span><i className="key key-core" />Insulating core, 50 to 200 mm thick</span>
      </figcaption>
      <p className="panel-note">
        The machine makes standard panels fast. Only hand work can do odd sizes, rock-wool cores, curves and built-in pipe holes,
        which is 40% of demand.
      </p>
    </figure>
  );
}

export default function Intro({ rows, nSims, onWhatIf }) {
  const top = rows && recommended(rows);
  const best = rows && familyBests(rows);
  const losing = top ? Math.round(top.P_NPV_below_0 * nSims) : 0;
  const allFirst = top && top.worst_rank_profiles === 1;

  return (
    <header className="intro">
      <p className="kicker">Team STOEDIO · Bosshire × PPIT Xiamen Business Case Competition 2026</p>
      <h1>Machine first, by rule</h1>
      <div className="intro-grid">
        <div className="intro-text">
          <p className="intro-lead">
            PT Green Cold's panel machine is worn out. The owner can pay IDR 3.5 billion for a new machine or
            IDR 2.2 billion for a hand-building hall, but not both. We simulated two years of the plant {nSims} times
            to see which choice holds up best.
          </p>

          <div className="answer">
            <h2 className="answer-title">Our recommendation</h2>
            <p>
              <b>Buy the new machine</b> for repeat builder orders, and keep making custom project panels by hand:
              on days the machine isn't needed, with a second-shift crew, and with partners for the overflow.
              A written rule decides which order goes where.
            </p>
          </div>

          {top ? (
            <ul className="findings">
              <li>
                It creates the most value: <b>IDR {fmt.bn1(top.E_NPV_bn)} billion</b> over two years on average,
                against {fmt.bn1(best.Hand.E_NPV_bn)} for the hand hall and {fmt.bn1(best.Machine.E_NPV_bn)} for machine only.
              </li>
              <li>
                It is also the safest. Even in the worst 5% of futures it averages <b>IDR {fmt.bn1(top.CVaR5_NPV_bn)} billion</b>,
                and {losing === 0 ? "none" : losing} of the {nSims} simulated futures lose money.
              </li>
              <li>
                Builders get <b>{fmt.pct(top.builder_ontime)}</b> of orders on time. Projects are the weak spot:
                {" "}<b>{fmt.pct(top.project_ontime)}</b> arrive within the 12-day promise, so that is the number to watch.
              </li>
              <li>
                {allFirst
                  ? "It comes first out of 152 options whether you care most about profit, risk, service or serving every order."
                  : `It ranks near the top out of 152 options (average position ${top.avg_rank_profiles.toFixed(1)}).`}
              </li>
            </ul>
          ) : (
            <p className="loading">Running the simulation…</p>
          )}
          <button type="button" className="btn btn-primary" onClick={onWhatIf}>Test it with your own what-if</button>
        </div>
        <PanelDrawing />
      </div>
    </header>
  );
}
