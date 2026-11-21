import { useEffect, useState } from "react";
import { DEFAULTS, PROFILES } from "./sim/core.js";
import { useSimulation } from "./sim/useSimulation.js";
import ReadPage from "./components/ReadPage.jsx";
import TryPage from "./components/TryPage.jsx";

const TABS = [["read", "Read"], ["try", "Try the simulator"]];
const tabFromHash = () => (location.hash === "#try" ? "try" : "read");

export default function App() {
  const [tab, setTab] = useState(tabFromHash);
  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  const go = (t) => { location.hash = t; setTab(t); scrollTo(0, 0); };

  // Shared by both tabs, so the model only runs once.
  const [params, setParams] = useState(DEFAULTS);
  const [nSims, setNSims] = useState(400);
  const [seed, setSeed] = useState(7);
  const [priority, setPriority] = useState("Profit-first");
  const [weights, setWeights] = useState(PROFILES["Profit-first"]);
  const sim = useSimulation(params, nSims, seed);

  const reset = () => { setParams(DEFAULTS); setNSims(400); setSeed(7); };
  const changes = Object.keys(DEFAULTS).filter((k) => Math.abs(params[k] - DEFAULTS[k]) > 1e-9).length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-in">
          <span className="brand">PT Green Cold <span>Machine or hand?</span></span>
          <nav className="tabs" aria-label="Pages">
            {TABS.map(([id, name]) => (
              <a key={id} href={`#${id}`} aria-current={tab === id ? "page" : undefined}
                onClick={(e) => { e.preventDefault(); go(id); }}>{name}</a>
            ))}
          </nav>
          <span className={`status ${sim.busy ? "is-busy" : ""}`} role="status">
            <span className="status-bar"><span style={{ width: `${(sim.busy ? sim.progress : 1) * 100}%` }} /></span>
            <span className="status-txt">{sim.busy ? "Updating…" : changes ? `Your what-if (${changes} change${changes > 1 ? "s" : ""})` : "Base case"}</span>
          </span>
        </div>
      </header>

      {tab === "read" ? (
        <ReadPage rows={sim.rows} nSims={nSims} onTry={() => go("try")} />
      ) : (
        <TryPage
          sim={sim} params={params} setParams={setParams} nSims={nSims} setNSims={setNSims} seed={seed} setSeed={setSeed}
          priority={priority} setPriority={setPriority} weights={weights} setWeights={setWeights}
          changes={changes} onReset={reset} onHelp={() => go("read")}
        />
      )}
    </div>
  );
}
