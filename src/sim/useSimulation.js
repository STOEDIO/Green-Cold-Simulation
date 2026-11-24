import { useEffect, useRef, useState, useCallback } from "react";
import * as GC from "./core.js";

// Runs the model whenever the inputs change. The work is split into small chunks with
// pauses in between, so the page stays responsive; a newer run cancels an older one.
const configs = GC.enumerateConfigs();
const pause = () => new Promise((r) => setTimeout(r, 0));

async function runModel({ p, nSims, seed, isStale, onProgress, onBase, onStress }) {
  const sc = GC.drawScenarios(p, nSims, seed);
  const rows = [];
  for (let i = 0; i < configs.length; i++) {
    rows.push(GC.summarise(configs[i], GC.simulate(configs[i], p, sc)));
    if (i % 16 === 15) {
      onProgress(((i + 1) / configs.length) * 0.5);
      await pause();
      if (isStale()) return;
    }
  }
  GC.addRankings(rows);
  onBase(rows, { p, sc });

  const sens = [];
  for (let s = 0; s < GC.SCENARIOS.length; s++) {
    onProgress(0.5 + (s / GC.SCENARIOS.length) * 0.5);
    await pause();
    if (isStale()) return;
    const [name, over] = GC.SCENARIOS[s];
    const ps = { ...p, ...over };
    const scS = GC.drawScenarios(ps, 150, seed + 1);
    const best = {};
    for (const c of configs) {
      const r = GC.simulate(c, ps, scS);
      let m = 0;
      for (const v of r.npv) m += v;
      m /= r.npv.length * 1e9;
      if (!best[c.family] || m > best[c.family].value) best[c.family] = { value: m, label: c.label };
    }
    sens.push({ name, best });
  }
  onStress(sens);
}

// One simulated future of one set-up, with the day-by-day record.
function replayPath(ctx, cfgId, path) {
  const { p, sc } = ctx;
  const r = GC.simulate(configs[cfgId], p, sc, { tracePath: path, monthly: true });
  const n = sc.n, M = p.months;
  const band = [], mine = [];
  for (let m = 0; m < M; m++) {
    const v = [];
    for (let i = 0; i < n; i++) v.push(r.gpMonth[m * n + i] / 1e6);
    v.sort((a, b) => a - b);
    band.push([v[Math.floor(0.05 * (n - 1))], v[Math.ceil(0.95 * (n - 1))]]);
    mine.push(r.gpMonth[m * n + path] / 1e6);
  }
  const sorted = Array.from(r.npv).sort((a, b) => a - b);
  return {
    cfgId, path, trace: r.trace, band, mine,
    npv: r.npv[path] / 1e9,
    betterThan: sorted.findIndex((v) => v >= r.npv[path]) / n,
    failMonth: sc.fail[path], beltDays: r.belt_days[path], handDays: r.hand_days[path],
    storeCap: p.store_cap, daysPerMonth: p.days_per_month, months: M,
  };
}

// The deck's quarterly-review numbers for one combination.
function kpisFor(ctx, cfgId) {
  const { p, sc } = ctx;
  const r = GC.simulate(configs[cfgId], p, sc, { monthly: true });
  const n = sc.n, M = p.months;
  let gp = 0, worst = 1;
  for (let m = 0; m < M; m++) {
    let g = 0, ot = 0, dem = 0;
    for (let i = 0; i < n; i++) { g += r.gpMonth[m * n + i]; ot += r.potMonth[m * n + i]; dem += r.pdemMonth[m * n + i]; }
    if (m >= 6) gp += g / n / 1e6;
    if (dem > 0) worst = Math.min(worst, ot / dem);
  }
  return { gpFromMonth7: gp / (M - 6), worstMonthProjectOntime: worst };
}

export function useSimulation(params, nSims, seed) {
  const runId = useRef(0);
  const ctx = useRef(null);
  const [state, setState] = useState({ rows: null, sens: null, busy: true, progress: 0, version: 0 });

  useEffect(() => {
    const id = ++runId.current;
    const isStale = () => id !== runId.current;
    const t = setTimeout(() => {
      setState((s) => ({ ...s, busy: true, progress: 0 }));
      runModel({
        p: params, nSims, seed, isStale,
        onProgress: (done) => !isStale() && setState((s) => ({ ...s, progress: done })),
        onBase: (rows, c) => { if (isStale()) return; ctx.current = c; setState((s) => ({ ...s, rows, version: s.version + 1 })); },
        onStress: (sens) => !isStale() && setState((s) => ({ ...s, sens, busy: false, progress: 1 })),
      });
    }, 250);
    return () => clearTimeout(t);
  }, [params, nSims, seed]);

  const getReplay = useCallback((cfgId, path) => (ctx.current ? replayPath(ctx.current, cfgId, path) : null), []);
  const getKpis = useCallback((cfgId) => (ctx.current ? kpisFor(ctx.current, cfgId) : null), []);
  return { ...state, getReplay, getKpis };
}
