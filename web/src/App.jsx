import { useEffect, useMemo, useState } from "react";
import { DEFAULTS } from "./sim/core.js";
import { useSimulation } from "./sim/useSimulation.js";
import { recommended } from "./lib.js";
import Intro from "./components/Intro.jsx";
import DecisionTable from "./components/DecisionTable.jsx";
import WhatIf from "./components/WhatIf.jsx";
import ModelDiagram from "./components/ModelDiagram.jsx";
import Replay from "./components/Replay.jsx";
import Explorer from "./components/Explorer.jsx";
import Ranking from "./components/Ranking.jsx";
import StressTests from "./components/StressTests.jsx";

const SECTIONS = [
  ["options", "The three options"],
  ["whatif", "Try a what-if"],
  ["model", "How the simulation works"],
  ["replay", "Watch two years play out"],
  ["setups", "All 152 ways to run the plant"],
  ["ranking", "What matters most to you?"],
  ["stress", "Does the answer hold up?"],
];

function Section({ id, n, title, intro, children }) {
  return (
    <section id={id} className="section">
      <header className="section-head">
        <h2><span className="section-n">{n}</span>{title}</h2>
        {intro && <p className="section-intro">{intro}</p>}
      </header>
      {children}
    </section>
  );
}

export default function App() {
  const [params, setParams] = useState(DEFAULTS);
  const [nSims, setNSims] = useState(400);
  const [seed, setSeed] = useState(7);
  const sim = useSimulation(params, nSims, seed);
  const { rows, sens, busy, progress } = sim;

  const [selectedId, setSelectedId] = useState(null);
  const [replayId, setReplayId] = useState(null);
  const top = useMemo(() => (rows ? recommended(rows) : null), [rows]);
  const sel = selectedId ?? top?.id;
  const rep = replayId ?? top?.id;

  // Sections only exist once the first run finishes, so honour a #section link then.
  const hasRows = !!rows;
  useEffect(() => {
    if (hasRows && location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [hasRows]);

  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  const goReplay = (id) => { setReplayId(id); scrollTo("replay"); };
  const goInspect = (id) => { setSelectedId(id); scrollTo("setups"); };

  const changes = Object.keys(DEFAULTS).filter((k) => Math.abs(params[k] - DEFAULTS[k]) > 1e-9).length;
  const reset = () => { setParams(DEFAULTS); setNSims(400); setSeed(7); };

  return (
    <div className="layout">
      <aside className="side">
        <a href="#top" className="side-title">PT Green Cold<br /><span>Machine or hand?</span></a>
        <nav className="side-nav" aria-label="Sections">
          {SECTIONS.map(([id, name], i) => (
            <a key={id} href={`#${id}`}><span>{i + 1}</span>{name}</a>
          ))}
        </nav>
        <div className={`run ${busy ? "is-busy" : ""}`} role="status">
          <div className="run-bar"><div style={{ width: `${(busy ? progress : 1) * 100}%` }} /></div>
          <p>
            {busy ? "Updating the numbers…" : changes ? `Showing your what-if (${changes} change${changes > 1 ? "s" : ""})` : "Showing our base case"}
          </p>
          {changes > 0 && <button type="button" className="link-btn" onClick={reset}>Back to our base case</button>}
        </div>
      </aside>

      <main id="top" className="main">
        <Intro rows={rows} nSims={nSims} onWhatIf={() => scrollTo("whatif")} />
        {rows ? (
          <>
            <Section id="options" n="1" title="The three options"
              intro="The brief puts three positions on the table. Each can be run in several ways, so for each one we show the version that earns the most.">
              <DecisionTable rows={rows} />
            </Section>
            <Section id="whatif" n="2" title="Try a what-if"
              intro="Pick a situation, or change a number yourself. Every figure on this page updates in a second or two, so you can see whether our recommendation still wins.">
              <WhatIf params={params} setParams={setParams} nSims={nSims} setNSims={setNSims} seed={seed} setSeed={setSeed} rows={rows} busy={busy} onReset={reset} />
            </Section>
            <Section id="model" n="3" title="How the simulation works"
              intro="Two operators can run the machine, or all eight can build panels by hand, but not both on the same day. So the real question is how the crew spends its 22 working days each month. The simulation plays that out one day at a time.">
              <ModelDiagram nSims={nSims} rows={rows} />
            </Section>
            <Section id="replay" n="4" title="Watch two years play out"
              intro="Here is one possible future, day by day: orders coming in, what the crew works on, stock in the store and money earned. Press play, or move along the charts. Try another future with the buttons below.">
              <Replay rows={rows} version={sim.version} cfgId={rep} setCfgId={setReplayId} nSims={nSims} getReplay={sim.getReplay} />
            </Section>
            <Section id="setups" n="5" title="All 152 ways to run the plant"
              intro="Each dot is one way of running the plant, averaged over all the futures we simulated. Further right means more profit; higher means better on the measure you choose. Click a dot to see what it is.">
              <Explorer rows={rows} selectedId={sel} onSelect={setSelectedId} onReplay={goReplay} />
            </Section>
            <Section id="ranking" n="6" title="What matters most to you?"
              intro="Different owners weigh things differently. Choose a priority, or set your own balance, and see which way of running the plant comes out on top.">
              <Ranking rows={rows} onInspect={goInspect} />
            </Section>
            <Section id="stress" n="7" title="Does the answer hold up?"
              intro="We tested nine things that could go wrong. For each, we re-ran all 152 options and asked which position still earns the most.">
              <StressTests sens={sens} busy={busy} />
            </Section>
          </>
        ) : (
          <p className="loading">Simulating 152 ways to run the plant across {nSims} possible futures…</p>
        )}
        <footer className="foot">
          <p>
            <b>About the numbers.</b> Profit figures are gross profit (before overheads and tax) after extra wages and hiring.
            "Value created" is the net present value over 24 months: future profit converted to today's money at 12% a year,
            minus the investment, plus what the equipment is still worth after two of its ten years.
          </p>
          <p>
            This site runs a JavaScript version of our <code>simulation.py</code> with the same logic and assumptions. It uses a different
            random-number generator, so figures can differ from our deck in the second decimal place.
          </p>
          <p>Case: PT Green Cold (2026), <i>Machine or Hand</i>, Bosshire × PPIT Xiamen Business Case Competition 2026. Analysis by Team STOEDIO.</p>
        </footer>
      </main>
    </div>
  );
}
