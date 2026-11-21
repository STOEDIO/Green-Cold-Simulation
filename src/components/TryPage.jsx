import { useMemo, useRef, useState } from "react";
import { recommended, familyBests, FAMILY_NAME, fmt } from "../lib.js";
import ControlPanel from "./ControlPanel.jsx";
import DecisionTable from "./DecisionTable.jsx";
import Replay from "./Replay.jsx";
import Explorer from "./Explorer.jsx";
import Ranking from "./Ranking.jsx";
import StressTests from "./StressTests.jsx";

const VIEWS = [["overview", "Overview"], ["day", "Day by day"], ["all", "All options"], ["ranking", "Ranking"], ["stress", "Stress tests"]];

function Headline({ rows, busy, changes }) {
  const best = familyBests(rows);
  const order = Object.entries(best).sort((a, b) => b[1].E_NPV_bn - a[1].E_NPV_bn);
  const [winFam, win] = order[0];
  const base = useRef(null);
  if (!changes && !busy) base.current = win.E_NPV_bn;
  const diff = base.current != null && changes ? win.E_NPV_bn - base.current : null;
  return (
    <div className={`headline ${busy ? "is-busy" : ""}`} aria-live="polite">
      <div className="headline-main">
        <span className="headline-label">Earns the most</span>
        <span className="headline-win"><i className={`swatch ${winFam}`} />{FAMILY_NAME[winFam]}</span>
      </div>
      <div className="headline-nums">
        {order.map(([f, r]) => (
          <span key={f} className={f === winFam ? "is-win" : ""}>
            <i className={`swatch ${f}`} /><b className="num">{fmt.bn1(r.E_NPV_bn)}</b>
          </span>
        ))}
        <span className="headline-unit">IDR B value created{diff != null && <> · {diff >= 0 ? "+" : ""}{fmt.bn1(diff)} vs base</>}</span>
      </div>
    </div>
  );
}

export default function TryPage(props) {
  const { sim, weights, onHelp } = props;
  const { rows, sens, busy } = sim;
  const [view, setView] = useState("overview");
  const [selectedId, setSelectedId] = useState(null);
  const [replayId, setReplayId] = useState(null);
  const top = useMemo(() => (rows ? recommended(rows) : null), [rows]);

  return (
    <div className="try">
      <ControlPanel {...props} />
      <main className="results">
        {!rows ? (
          <p className="loading">Running the simulation…</p>
        ) : (
          <>
            <Headline rows={rows} busy={busy} changes={props.changes} />
            <div className="views" role="tablist" aria-label="Views">
              {VIEWS.map(([id, name]) => (
                <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}>{name}</button>
              ))}
              <button type="button" className="link-btn views-help" onClick={onHelp}>How does this work?</button>
            </div>
            <div className="view">
              {view === "overview" && <DecisionTable rows={rows} />}
              {view === "day" && (
                <Replay rows={rows} version={sim.version} cfgId={replayId ?? top.id} setCfgId={setReplayId} nSims={props.nSims} getReplay={sim.getReplay} />
              )}
              {view === "all" && (
                <Explorer rows={rows} selectedId={selectedId ?? top.id} onSelect={setSelectedId}
                  onReplay={(id) => { setReplayId(id); setView("day"); }} />
              )}
              {view === "ranking" && (
                <Ranking rows={rows} weights={weights} onInspect={(id) => { setSelectedId(id); setView("all"); }} />
              )}
              {view === "stress" && <StressTests sens={sens} busy={busy} />}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
