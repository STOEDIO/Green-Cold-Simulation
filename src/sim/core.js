/* PT Green Cold: path-wise discrete-event simulation, JavaScript port of simulation.py.
 Same model, same assumptions, same configuration grid and ranking. The random-number
 generator differs from numpy's, so figures match the Python run up to Monte Carlo noise.
 Used by the Web Worker in worker.js. */

const DEFAULTS = {
  months: 24, days_per_month: 22, discount_annual: 0.12, asset_life_years: 10.0,
  capex_line: 3.5e9, capex_hall: 2.2e9,
  price_machine: 300000, price_index_hand: 1.35, gm_machine: 0.18, gm_hand: 0.28, machine_price_shock: 0.0,
  belt_rate: 600, belt_changeover_days: 0.5, belt_min_block_days: 2, hand_rate: 120, hand_setup_days: 0.2,
  store_cap: 2000, start_stock: 1000,
  demand_total_month: 11000, share_builder: 0.60, builder_level_cv: 0.15, builder_daily_cv: 0.70,
  project_mean_size: 100, project_size_cv: 1.0, project_level_cv: 0.25,
  project_promise: 12, project_patience: 24,
  overflow_quote_max: 12,   // routing rule v2: overflow set-ups send a project to a partner above this quote (days)
  partner_cap_month: 1e12,  // partner m² a month; unlimited except in the capacity stress test
  open_month: 3, ramp_months: 2, ramp_productivity: 0.5, crew_size: 8, wage_month: 5.0e6,
  second_shift_premium: 1.3, hiring_cost_per_op: 15.0e6,
  fail_min: 1.0, fail_max: 12.0,
  partner_project_margin: 0.08, partner_project_ontime: 0.80, resale_margin: 0.06, resale_ontime: 0.70,
  churn_stockout: 0.25, churn_cross: 0.15, cross_share: 0.30, churn_project: 0.10,
  loyalty_recovery: 0.03, loyalty_floor: 0.30,
};

const SCENARIOS = [
  ["Base case", {}],
  ["No cross-sell churn (γ = 0)", { churn_cross: 0.0 }],
  ["Strong cross-sell churn (γ = 0.4)", { churn_cross: 0.40 }],
  ["Builder price war (−5% price)", { machine_price_shock: 0.05 }],
  ["Lower demand (total −12%)", { demand_total_month: 11000 * (1 - 0.6 * 0.2) }],
  ["Slow crew ramp-up (30% for 4 mo)", { ramp_months: 4, ramp_productivity: 0.3 }],
  ["Old line dies early (months 1–6)", { fail_max: 6.0 }],
  ["Unreliable partner (40–50% on time)", { partner_project_ontime: 0.4, resale_ontime: 0.5 }],
  ["Expensive labour (2× wage)", { wage_month: 10.0e6 }],
  ["New line late (ready month 8)", { open_month: 7 }],
  ["Partner capacity capped (600 m²/mo)", { partner_cap_month: 600 }],
];

const OBJECTIVES = ["E_NPV_bn", "CVaR5_NPV_bn", "weakest_side_ontime", "coverage"];
const PROFILES = {
  "Profit-first":      { E_NPV_bn: 0.60, CVaR5_NPV_bn: 0.20, weakest_side_ontime: 0.10, coverage: 0.10 },
  "Risk-averse":       { E_NPV_bn: 0.25, CVaR5_NPV_bn: 0.50, weakest_side_ontime: 0.15, coverage: 0.10 },
  "Neither-side-lost": { E_NPV_bn: 0.30, CVaR5_NPV_bn: 0.20, weakest_side_ontime: 0.30, coverage: 0.20 },
  "Coverage-first":    { E_NPV_bn: 0.15, CVaR5_NPV_bn: 0.10, weakest_side_ontime: 0.30, coverage: 0.45 },
};

// ---------------------------------------------------------------- RNG
function makeRng(seed) {
  // sfc32 seeded through splitmix32
  let s = seed >>> 0;
  function sm() { s = (s + 0x9e3779b9) >>> 0; let z = s; z = Math.imul(z ^ (z >>> 16), 0x85ebca6b); z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35); return (z ^ (z >>> 16)) >>> 0; }
  let a = sm(), b = sm(), c = sm(), d = 1;
  function u() {
    const t = (((a + b) >>> 0) + d) >>> 0; d = (d + 1) >>> 0;
    a = b ^ (b >>> 9); b = (c + (c << 3)) >>> 0; c = ((c << 21) | (c >>> 11)); c = (c + t) >>> 0;
    return (t + 0.5) / 4294967296;
  }
  let spare = null;
  function normal() {
    if (spare !== null) { const v = spare; spare = null; return v; }
    let x, y, r;
    do { x = 2 * u() - 1; y = 2 * u() - 1; r = x * x + y * y; } while (r >= 1 || r === 0);
    const f = Math.sqrt(-2 * Math.log(r) / r); spare = y * f; return x * f;
  }
  function gamma(shape, scale) {
    if (shape < 1) { const g = gamma(shape + 1, 1); return g * Math.pow(u(), 1 / shape) * scale; }
    const d3 = shape - 1 / 3, c3 = 1 / Math.sqrt(9 * d3);
    for (;;) {
      let x, v; do { x = normal(); v = 1 + c3 * x; } while (v <= 0);
      v = v * v * v; const uu = u();
      if (uu < 1 - 0.0331 * x * x * x * x || Math.log(uu) < 0.5 * x * x + d3 * (1 - v + Math.log(v))) return d3 * v * scale;
    }
  }
  function poisson(lam) {
    if (lam <= 0) return 0;
    if (lam > 30) return Math.max(0, Math.round(lam + Math.sqrt(lam) * normal()));
    const L = Math.exp(-lam); let k = 0, p = 1;
    do { k++; p *= u(); } while (p > L);
    return k - 1;
  }
  return { u, normal, gamma, poisson };
}

// ---------------------------------------------------------------- scenarios (common random numbers)
function drawScenarios(p, n, seed) {
  const rng = makeRng(seed);
  const M = p.months, D = p.days_per_month, T = M * D;
  const ln1 = (cv) => { const s2 = Math.log(1 + cv * cv); return () => Math.exp(-s2 / 2 + Math.sqrt(s2) * rng.normal()); };
  const bl = ln1(p.builder_level_cv), pl = ln1(p.project_level_cv);
  const b_level = new Float64Array(M * n), p_level = new Float64Array(M * n);
  for (let i = 0; i < M * n; i++) b_level[i] = bl();
  for (let i = 0; i < M * n; i++) p_level[i] = pl();
  const shape = 1 / (p.builder_daily_cv * p.builder_daily_cv);
  const b_noise = new Float64Array(T * n);
  for (let i = 0; i < T * n; i++) b_noise[i] = rng.gamma(shape, 1 / shape);
  const lam = p.demand_total_month * (1 - p.share_builder) / D / p.project_mean_size;
  const kappa = 1 / (p.project_size_cv * p.project_size_cv);
  const k = new Float64Array(T * n), size = new Float64Array(T * n);
  for (let t = 0; t < T; t++) {
    const m = (t / D) | 0;
    for (let i = 0; i < n; i++) {
      const kk = rng.poisson(lam * p_level[m * n + i]);
      k[t * n + i] = kk;
      size[t * n + i] = kk > 0 ? rng.gamma(kk * kappa, p.project_mean_size / kappa) : 0;
    }
  }
  const fail = new Float64Array(n);
  for (let i = 0; i < n; i++) fail[i] = p.fail_min + (p.fail_max - p.fail_min) * rng.u();
  return { n, b_level, b_noise, k, size, fail };
}

// ---------------------------------------------------------------- configurations
function family(c) {
  if (c.capex === "line") return (c.project_mode === "drop" || c.project_mode === "partner_all") ? "Machine" : "Split";
  return "Hand";
}
function label(c) {
  const proj = { inhouse: "projects in-house", overflow: "in-house + partner overflow", partner_all: "projects to partner", drop: "projects dropped" }[c.project_mode];
  const shift = (c.capex === "line" && c.extra_crews) ? " (2nd shift)" : "";
  return `${c.capex === "line" ? "New line" : "Hand hall"} · +${c.extra_crews} crew${shift} · ${c.core_hand ? "core crew does hand" : "core crew belt-only"} · ${proj} · resale ${c.resale ? "on" : "off"} · (s,S)=(${c.reorder},${c.order_up_to})`;
}
function enumerateConfigs() {
  const out = [];
  for (const capex of ["line", "hall"]) {
    const maxExtra = capex === "line" ? 1 : 2;
    for (let extra = 0; extra <= maxExtra; extra++) for (const core of [0, 1]) for (const mode of ["drop", "partner_all", "inhouse", "overflow"]) {
      const hc = core + extra;
      if ((mode === "drop" || mode === "partner_all") && hc > 0) continue;
      if ((mode === "inhouse" || mode === "overflow") && hc === 0) continue;
      if (capex === "hall" && hc === 0) continue;
      const sg = core ? [500, 900, 1300] : [500];
      for (const s of sg) for (const S of [1500, 2000]) for (const rs of [0, 1]) {
        const c = { capex, extra_crews: extra, core_hand: core, project_mode: mode, resale: rs, reorder: s, order_up_to: S };
        c.family = family(c); c.label = label(c); c.id = out.length;
        out.push(c);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- the simulation (one path at a time)
function simulate(cfg, p, sc, opts) {
  opts = opts || {};
  const n = sc.n, D = p.days_per_month, M = p.months, T = M * D;
  const pm = p.price_machine, ph = pm * p.price_index_hand;
  const gp_m = pm * (p.gm_machine - p.machine_price_shock), gp_h = ph * p.gm_hand;
  const s = cfg.reorder, S = cfg.order_up_to;
  const inhouse = cfg.project_mode === "inhouse" || cfg.project_mode === "overflow";
  const overflow = cfg.project_mode === "overflow", partnerAll = cfg.project_mode === "partner_all";
  const isLine = cfg.capex === "line";
  const base_b = p.demand_total_month * p.share_builder / D;
  const rm = Math.pow(1 + p.discount_annual, 1 / 12) - 1;

  const capex = isLine ? p.capex_line : p.capex_hall;
  const wage = cfg.extra_crews * p.crew_size * p.wage_month * (isLine ? p.second_shift_premium : 1);
  const fixed = new Float64Array(M), df = new Float64Array(M);
  for (let m = 0; m < M; m++) { fixed[m] = m >= p.open_month ? wage : 0; df[m] = Math.pow(1 + rm, -(m + 1)); }
  if (p.open_month < M) fixed[p.open_month] += cfg.extra_crews * p.crew_size * p.hiring_cost_per_op;
  const residual = capex * Math.max(0, 1 - (M / 12) / p.asset_life_years);
  const ramps = new Float64Array(M);
  for (let m = 0; m < M; m++) ramps[m] = m < p.open_month ? 0 : (m < p.open_month + p.ramp_months ? p.ramp_productivity : 1);

  const npv = new Float64Array(n), gpT = new Float64Array(n), bsl = new Float64Array(n), psl = new Float64Array(n),
    slmin = new Float64Array(n), cov = new Float64Array(n), loyB = new Float64Array(n), loyP = new Float64Array(n),
    beltD = new Float64Array(n), handD = new Float64Array(n), partnerShare = new Float64Array(n);
  const gpMonthAll = opts.monthly ? new Float64Array(M * n) : null;
  const potMonth = opts.monthly ? new Float64Array(M * n) : null, pdemMonth = opts.monthly ? new Float64Array(M * n) : null;
  const trace = opts.tracePath != null ? { stock: [], belt: [], hand: [], backlog: [], dem_b: [], sold: [], unmet: [], proj: [], partner: [], gp: [], loy_b: [], loy_p: [], avail: [], lead: [] } : null;

  for (let i = 0; i < n; i++) {
    const doTrace = trace && i === opts.tracePath;
    let stock = Math.min(p.start_stock, S), inBlock = false, blockLen = 0, prevBelt = false;
    let W = 0, V = 0, capRate = 0.5 * cfg.core_hand, lb = 1, lp = 1;
    let tb_dem = 0, tb_ot = 0, tb_srv = 0, tp_dem = 0, tp_ot = 0, tp_srv = 0, bd = 0, hd = 0;
    let mb_dem = 0, mb_ot = 0, mp_dem = 0, mp_ot = 0, gpm = 0, npvAcc = 0, gpAcc = 0, monPartner = 0, partnerTot = 0;
    const fail = sc.fail[i];
    for (let t = 0; t < T; t++) {
      const m = (t / D) | 0, mo = t / D;
      if (t % D === 0) { mb_dem = mb_ot = mp_dem = mp_ot = 0; gpm = 0; monPartner = 0; }
      const avail = fail > mo || (isLine && m >= p.open_month);
      if (avail && !inBlock && stock < s) inBlock = true;
      if (!avail) inBlock = false;
      blockLen = inBlock ? blockLen + 1 : 0;
      if (inBlock && blockLen > p.belt_min_block_days && stock >= S) inBlock = false;
      let belt = inBlock;
      const coreHand = cfg.core_hand === 1 && inhouse && !belt && W > 1e-9;
      const topup = !belt && !coreHand && avail && stock < S;
      if (topup) { belt = true; inBlock = true; if (blockLen === 0) blockLen = 1; }
      const capB = prevBelt ? p.belt_rate : p.belt_rate * (1 - p.belt_changeover_days);
      const prod = belt ? Math.min(capB, p.store_cap - stock) : 0;
      stock += prod; prevBelt = belt;
      if (belt) bd++; if (coreHand) hd++;

      // builders
      const idx = t * n + i;
      const dem_b = base_b * lb * sc.b_level[m * n + i] * sc.b_noise[idx];
      const sold = Math.min(stock, dem_b); stock -= sold;
      const unmet = dem_b - sold;
      const resale = cfg.resale ? unmet : 0;
      let gpDay = sold * gp_m + resale * pm * p.resale_margin;
      const b_ot = sold + p.resale_ontime * resale, b_srv = sold + resale;

      // projects
      const k = sc.k[idx] * lp, sz = sc.size[idx] * lp;
      const A = sz / p.hand_rate + p.hand_setup_days * k;
      let p_ot = 0, p_srv = 0, partnerVol = 0, lead = 0;
      const partnerFull = monPartner >= p.partner_cap_month;
      if (partnerAll) partnerVol = partnerFull ? 0 : sz;   // beyond partner capacity: lost
      else if (inhouse) {
        lead = (W + 0.5 * A) / Math.max(capRate, 0.05);
        // v2 rule: overflow set-ups keep the 12-day promise and pass longer quotes to the partner,
        // unless the partner is full this month (then keep it if the client will still wait)
        const accept = overflow
          ? lead <= p.overflow_quote_max || (partnerFull && lead <= p.project_patience)
          : lead <= p.project_patience;
        const accVol = accept ? sz : 0;
        if (accept) W += A;
        V += accVol * gp_h;
        if (lead <= p.project_promise) p_ot += accVol;
        p_srv += accVol;
        if (overflow && !accept && !partnerFull) partnerVol = sz;
      }
      monPartner += partnerVol; partnerTot += partnerVol;
      gpDay += partnerVol * ph * p.partner_project_margin;
      p_ot += p.partner_project_ontime * partnerVol; p_srv += partnerVol;

      // hand production
      const capToday = (coreHand ? 1 : 0) + cfg.extra_crews * ramps[m];
      const done = Math.min(W, capToday);
      const frac = W > 1e-9 ? done / Math.max(W, 1e-9) : 0;
      const realised = V * frac; V -= realised; W -= done;
      gpDay += realised;
      capRate = 0.85 * capRate + 0.15 * capToday;

      gpm += gpDay;
      tb_dem += dem_b; tb_ot += b_ot; tb_srv += b_srv; tp_dem += sz; tp_ot += p_ot; tp_srv += p_srv;
      mb_dem += dem_b; mb_ot += b_ot; mp_dem += sz; mp_ot += p_ot;

      if (doTrace) {
        trace.stock.push(stock); trace.belt.push(belt ? 1 : 0); trace.hand.push(coreHand ? 1 : 0); trace.backlog.push(W);
        trace.dem_b.push(dem_b); trace.sold.push(sold); trace.unmet.push(unmet); trace.proj.push(sz); trace.partner.push(partnerVol);
        trace.gp.push(gpDay); trace.loy_b.push(lb); trace.loy_p.push(lp); trace.avail.push(avail ? 1 : 0); trace.lead.push(inhouse ? lead : 0);
      }

      if (t % D === D - 1) {
        const bf = mb_ot / Math.max(mb_dem, 1e-9);
        const pok = mp_dem > 1e-9 ? mp_ot / Math.max(mp_dem, 1e-9) : 1;
        lb = Math.min(1, Math.max(p.loyalty_floor, lb * (1 - p.churn_stockout * (1 - bf) - p.cross_share * p.churn_cross * (1 - pok)) + p.loyalty_recovery * (1 - lb)));
        lp = Math.min(1, Math.max(p.loyalty_floor, lp * (1 - p.churn_project * (1 - pok)) + p.loyalty_recovery * (1 - lp)));
        npvAcc += (gpm - fixed[m]) * df[m]; gpAcc += gpm;
        if (gpMonthAll) { gpMonthAll[m * n + i] = gpm; potMonth[m * n + i] = mp_ot; pdemMonth[m * n + i] = mp_dem; }
      }
    }
    npv[i] = npvAcc - capex + residual * df[M - 1];
    gpT[i] = gpAcc;
    bsl[i] = tb_ot / tb_dem;
    psl[i] = tp_dem > 0 ? tp_ot / Math.max(tp_dem, 1e-9) : 1;
    slmin[i] = Math.min(bsl[i], psl[i]);
    cov[i] = (tb_srv + tp_srv) / (tb_dem + tp_dem);
    loyB[i] = lb; loyP[i] = lp; beltD[i] = bd; handD[i] = hd; partnerShare[i] = tp_dem > 0 ? partnerTot / tp_dem : 0;
  }
  return { npv, gp: gpT, b_sl: bsl, p_sl: psl, sl_min: slmin, cov, loy_b: loyB, loy_p: loyP, belt_days: beltD, hand_days: handD, partner_share: partnerShare,
    capex, fixed: Array.from(fixed), gpMonth: gpMonthAll, potMonth, pdemMonth, trace };
}

// ---------------------------------------------------------------- summaries
const mean = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / a.length; };
function percentile(sorted, q) { // numpy 'linear'
  const pos = (sorted.length - 1) * q / 100, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
function summarise(cfg, r) {
  const npv = Array.from(r.npv, (v) => v / 1e9);
  const sorted = npv.slice().sort((a, b) => a - b);
  const n = npv.length, k = Math.max(1, Math.ceil(0.05 * n));
  const mu = mean(npv);
  let sd = 0; for (const v of npv) sd += (v - mu) * (v - mu); sd = Math.sqrt(sd / n);
  let cv = 0; for (let i = 0; i < k; i++) cv += sorted[i]; cv /= k;
  let neg = 0; for (const v of npv) if (v < 0) neg++;
  return {
    id: cfg.id, family: cfg.family, label: cfg.label, capex_type: cfg.capex, extra_crews: cfg.extra_crews, core_hand: cfg.core_hand,
    project_mode: cfg.project_mode, resale: cfg.resale, reorder_s: cfg.reorder, order_up_to_S: cfg.order_up_to,
    capex_bn: r.capex / 1e9, E_NPV_bn: mu, SD_NPV_bn: sd, P5_NPV_bn: percentile(sorted, 5), CVaR5_NPV_bn: cv,
    P95_NPV_bn: percentile(sorted, 95), P_NPV_below_0: neg / n, E_GP_bn: mean(r.gp) / 1e9,
    builder_ontime: mean(r.b_sl), project_ontime: mean(r.p_sl), weakest_side_ontime: mean(r.sl_min), coverage: mean(r.cov),
    builder_retention_end: mean(r.loy_b), project_retention_end: mean(r.loy_p),
    core_belt_days: mean(r.belt_days), core_hand_days: mean(r.hand_days), partner_share: mean(r.partner_share),
    hist: histogram(npv),
  };
}
function histogram(v) { // compact distribution sketch: 41 quantiles
  const s = v.slice().sort((a, b) => a - b), q = [];
  for (let j = 0; j <= 40; j++) q.push(percentile(s, j * 2.5));
  return q;
}

// ---------------------------------------------------------------- ranking
function paretoLevels(Mx) {
  const n = Mx.length, level = new Array(n).fill(0);
  let remaining = [...Array(n).keys()], lv = 1;
  while (remaining.length) {
    const dom = remaining.map((i) => remaining.some((j) => {
      let allGe = true, anyGt = false;
      for (let c = 0; c < Mx[i].length; c++) { if (Mx[j][c] < Mx[i][c] - 1e-12) { allGe = false; break; } if (Mx[j][c] > Mx[i][c] + 1e-12) anyGt = true; }
      return allGe && anyGt;
    }));
    const next = [];
    remaining.forEach((i, a) => { if (dom[a]) next.push(i); else level[i] = lv; });
    remaining = next; lv++;
  }
  return level;
}
function rankDesc(vals) { // pandas rank(ascending=False, method="min")
  return vals.map((v) => 1 + vals.reduce((c, w) => c + (w > v ? 1 : 0), 0));
}
function normalised(rows) {
  const mm = {};
  for (const c of OBJECTIVES) { const v = rows.map((r) => r[c]); mm[c] = [Math.min(...v), Math.max(...v)]; }
  return rows.map((r) => { const o = {}; for (const c of OBJECTIVES) { const d = mm[c][1] - mm[c][0] || 1; o[c] = (r[c] - mm[c][0]) / d; } return o; });
}
function scoreWith(rows, w) {
  const N = normalised(rows);
  return N.map((nr) => OBJECTIVES.reduce((s, c) => s + nr[c] * (w[c] || 0), 0));
}
function addRankings(rows) {
  for (const c of OBJECTIVES) { const rk = rankDesc(rows.map((r) => r[c])); rows.forEach((r, i) => (r["rank_" + c] = rk[i])); }
  const lv = paretoLevels(rows.map((r) => OBJECTIVES.map((c) => r[c])));
  rows.forEach((r, i) => (r.pareto_level = lv[i]));
  for (const [name, w] of Object.entries(PROFILES)) {
    const sc = scoreWith(rows, w), rk = rankDesc(sc);
    rows.forEach((r, i) => { r["score_" + name] = sc[i]; r["rank_" + name] = rk[i]; });
  }
  rows.forEach((r) => {
    const rs = Object.keys(PROFILES).map((n) => r["rank_" + n]);
    r.avg_rank_profiles = rs.reduce((a, b) => a + b, 0) / rs.length;
    r.worst_rank_profiles = Math.max(...rs);
  });
  return rows;
}

function runAll(p, configs, nSims, seed, onProgress) {
  const sc = drawScenarios(p, nSims, seed);
  const rows = [];
  configs.forEach((c, i) => { rows.push(summarise(c, simulate(c, p, sc))); if (onProgress) onProgress(i + 1, configs.length); });
  return addRankings(rows);
}

export { DEFAULTS, SCENARIOS, OBJECTIVES, PROFILES, makeRng, drawScenarios, enumerateConfigs, simulate, summarise, addRankings, scoreWith, rankDesc, paretoLevels, runAll };
