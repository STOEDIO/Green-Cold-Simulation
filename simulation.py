#!/usr/bin/env python3
"""
PT Green Cold - Machine vs Hand sandwich panel: simulation + configuration optimiser
====================================================================================

Structure
---------
1. Params          every assumption in one place (EDIT THESE; anything not in the
                   brief's Table 1 is an assumption and is flagged ASSUMPTION).
2. draw_scenarios  common random numbers (same demand paths for every configuration,
                   so differences between configurations are not Monte Carlo noise).
3. simulate        daily, vectorised-over-paths simulation of one configuration:
                   shared-crew dispatch, (s,S) stock policy on the belt, 2,000 m2 store,
                   project backlog, lead-time promises, partner routes, churn feedback.
4. enumerate       every feasible configuration (capex x crews x policy x partner routes).
5. rank            multi-objective: Pareto levels + several weight profiles + per-objective ranks.
6. sensitivity     re-run everything under alternative assumptions, see who wins where.

Usage
-----
    python simulation.py                 # full run
    python simulation.py --quick         # fast sanity run
    python simulation.py --n-sims 1000 --seed 3
    python simulation.py --out results   # choose the output folder

Requires: numpy pandas matplotlib openpyxl
"""
from __future__ import annotations

import argparse
import itertools
import os
import time
from dataclasses import dataclass, replace

import numpy as np
import pandas as pd


# ----------------------------------------------------------------------------------
# 1. ASSUMPTIONS
# ----------------------------------------------------------------------------------
@dataclass(frozen=True)
class Params:
    # --- horizon / finance -----------------------------------------------------
    months: int = 24                      # brief: "next two years"
    days_per_month: int = 22              # brief
    discount_annual: float = 0.12         # ASSUMPTION  cost of capital
    asset_life_years: float = 10.0        # ASSUMPTION  straight-line; residual value counted at horizon
    capex_line: float = 3.5e9             # brief  IDR
    capex_hall: float = 2.2e9             # brief  IDR

    # --- prices & margins ------------------------------------------------------
    price_machine: float = 300_000        # ASSUMPTION  IDR/m2 (Table 1 gives only an index = 100)
    price_index_hand: float = 1.35        # brief (135)
    gm_machine: float = 0.18              # brief
    gm_hand: float = 0.28                 # brief
    machine_price_shock: float = 0.0      # sensitivity: price cut as share of price, cost held constant

    # --- capacity --------------------------------------------------------------
    belt_rate: float = 600.0              # brief  m2/day
    belt_changeover_days: float = 0.5     # brief  lost on first day of every belt block
    belt_min_block_days: int = 2          # ASSUMPTION  keeps every run >= 400 m2 per thickness
    hand_rate: float = 120.0              # brief  m2 per crew-day
    hand_setup_days: float = 0.2          # brief  per project
    store_cap: float = 2000.0             # brief  m2
    start_stock: float = 1000.0           # ASSUMPTION

    # --- demand ----------------------------------------------------------------
    demand_total_month: float = 11_000.0  # brief
    share_builder: float = 0.60           # brief
    builder_level_cv: float = 0.15        # ASSUMPTION  month-to-month volatility
    builder_daily_cv: float = 0.70        # ASSUMPTION  truckload lumpiness
    project_mean_size: float = 100.0      # ASSUMPTION  m2 per project (sets how many 0.2-day setups)
    project_size_cv: float = 1.0          # ASSUMPTION
    project_level_cv: float = 0.25        # ASSUMPTION  project pipeline is lumpier than builder demand

    # --- service promises ------------------------------------------------------
    project_promise: float = 12.0         # brief  days (treated as working days)
    project_patience: float = 24.0        # ASSUMPTION  quoted lead above this and the client walks

    # --- labour / roll-out of new capacity -----------------------------------------
    open_month: int = 3                   # ASSUMPTION  hall / new line / 2nd shift ready from this month
    ramp_months: int = 2                  # ASSUMPTION
    ramp_productivity: float = 0.5        # ASSUMPTION  new crew productivity during ramp-up
    crew_size: int = 8                    # brief
    wage_month: float = 5.0e6             # ASSUMPTION  IDR per operator per month
    second_shift_premium: float = 1.3     # ASSUMPTION  line config: extra crew works a 2nd shift
    hiring_cost_per_op: float = 15.0e6    # ASSUMPTION  recruiting + training, one-off

    # --- old line failure ----------------------------------------------------------
    fail_min: float = 1.0                 # brief: "replace within twelve months"
    fail_max: float = 12.0                # failure month ~ Uniform(fail_min, fail_max)

    # --- partner routes --------------------------------------------------------------
    partner_project_margin: float = 0.08  # ASSUMPTION  Green Cold keeps this share of project price
    partner_project_ontime: float = 0.80  # ASSUMPTION  P(partner meets the 12-day promise)
    resale_margin: float = 0.06           # ASSUMPTION  thin margin on resold machine panels
    resale_ontime: float = 0.70           # ASSUMPTION  P(resold panel meets the 5-day promise)

    # --- customer feedback (the unknown the brief never gives) ---------------------
    churn_stockout: float = 0.25          # ASSUMPTION  builder attrition per unit of monthly fill-rate shortfall
    churn_cross: float = 0.15             # ASSUMPTION  gamma: monthly attrition of mixed-delivery accounts when projects fail
    cross_share: float = 0.30             # ASSUMPTION  share of builder volume from accounts that also buy projects
    churn_project: float = 0.10           # ASSUMPTION  project-client attrition per unit of project failure
    loyalty_recovery: float = 0.03        # ASSUMPTION  monthly win-back of lost demand
    loyalty_floor: float = 0.30


# ----------------------------------------------------------------------------------
# 2. COMMON RANDOM NUMBERS
# ----------------------------------------------------------------------------------
def draw_scenarios(p: Params, n: int, seed: int) -> dict:
    rng = np.random.default_rng(seed)
    T = p.months * p.days_per_month
    mi = np.repeat(np.arange(p.months), p.days_per_month)

    def lognormal_mean1(cv, size):
        s2 = np.log(1 + cv ** 2)
        return rng.lognormal(-s2 / 2, np.sqrt(s2), size)

    b_level = lognormal_mean1(p.builder_level_cv, (p.months, n))
    p_level = lognormal_mean1(p.project_level_cv, (p.months, n))
    shape = 1 / p.builder_daily_cv ** 2
    b_noise = rng.gamma(shape, 1 / shape, (T, n))
    lam = p.demand_total_month * (1 - p.share_builder) / p.days_per_month / p.project_mean_size
    k = rng.poisson(lam * p_level[mi, :])                       # projects per day
    kappa = 1 / p.project_size_cv ** 2
    size = np.where(k > 0, rng.gamma(np.maximum(k, 1) * kappa, p.project_mean_size / kappa), 0.0)
    fail = rng.uniform(p.fail_min, p.fail_max, n)               # old-line death, in months
    return dict(n=n, b_level=b_level, b_noise=b_noise, k=k.astype(float), size=size, fail=fail)


# ----------------------------------------------------------------------------------
# 3. CONFIGURATION + SIMULATION
# ----------------------------------------------------------------------------------
@dataclass(frozen=True)
class Config:
    capex: str            # 'line' (replace belt, 3.5bn) | 'hall' (hand hall, 2.2bn, old line runs until it dies)
    extra_crews: int      # additional hand-only crews (hall: 0-2 ; line: 0-1 via second shift)
    core_hand: int        # 1 = the existing crew does hand batches on days the belt is not needed
    project_mode: str     # 'inhouse' | 'overflow' (in-house, spill to partner) | 'partner_all' | 'drop'
    resale: int           # 1 = unmet builder demand is covered by reselling a partner's machine panels
    reorder: int          # s: start a belt block when stock falls below this (m2)
    order_up_to: int      # S: stop the block when stock reaches this (m2, <= 2,000)

    @property
    def family(self) -> str:
        if self.capex == "line":
            return "Machine-focused" if self.project_mode in ("drop", "partner_all") else "Split (line + in-house hand)"
        return "Hand-focused (hall)"

    @property
    def label(self) -> str:
        proj = {"inhouse": "projects in-house", "overflow": "projects in-house + partner overflow",
                "partner_all": "projects to partner", "drop": "projects dropped"}[self.project_mode]
        core = "core crew does hand" if self.core_hand else "core crew belt-only"
        shift = " (2nd shift)" if (self.capex == "line" and self.extra_crews) else ""
        return (f"{'New line' if self.capex == 'line' else 'Hand hall'} | +{self.extra_crews} crew{shift} | "
                f"{core} | {proj} | resale {'on' if self.resale else 'off'} | (s,S)=({self.reorder},{self.order_up_to})")


def enumerate_configs() -> list[Config]:
    out = []
    for capex in ("line", "hall"):
        for extra in range(0, (1 if capex == "line" else 2) + 1):
            for core_hand in (0, 1):
                for mode in ("drop", "partner_all", "inhouse", "overflow"):
                    hand_cap = core_hand + extra
                    if mode in ("drop", "partner_all") and hand_cap > 0:
                        continue                                  # no point keeping idle hand capacity
                    if mode in ("inhouse", "overflow") and hand_cap == 0:
                        continue
                    if capex == "hall" and hand_cap == 0:
                        continue                                  # a hall nobody works in
                    s_grid = (500, 900, 1300) if core_hand else (500,)   # s only matters if the crew has a choice
                    for s, S, rs in itertools.product(s_grid, (1500, 2000), (0, 1)):
                        out.append(Config(capex, extra, core_hand, mode, rs, s, S))
    return out


def simulate(cfg: Config, p: Params, sc: dict) -> dict:
    n, D = sc["n"], p.days_per_month
    T = p.months * D
    pm = p.price_machine
    ph = pm * p.price_index_hand
    gp_m = pm * (p.gm_machine - p.machine_price_shock)         # gross profit per m2
    gp_h = ph * p.gm_hand
    s, S = float(cfg.reorder), float(cfg.order_up_to)
    inhouse = cfg.project_mode in ("inhouse", "overflow")
    base_b = p.demand_total_month * p.share_builder / D
    rm = (1 + p.discount_annual) ** (1 / 12) - 1

    stock = np.full(n, min(p.start_stock, S))
    in_block = np.zeros(n, bool)
    block_len = np.zeros(n)
    prev_belt = np.zeros(n, bool)
    W = np.zeros(n)                       # project backlog, crew-days
    V = np.zeros(n)                       # gross profit locked in that backlog, IDR
    cap_rate = np.full(n, 0.5 * cfg.core_hand)   # EWMA of daily hand capacity, for lead-time quotes
    loy_b = np.ones(n)
    loy_p = np.ones(n)

    gp_month = np.zeros((p.months, n))
    tot = {k: np.zeros(n) for k in ("b_dem", "b_ot", "b_srv", "p_dem", "p_ot", "p_srv", "belt_days", "hand_days")}
    mon = {k: np.zeros(n) for k in ("b_dem", "b_ot", "p_dem", "p_ot")}

    for t in range(T):
        m = t // D
        mo = t / D
        if t % D == 0:
            for k in mon:
                mon[k][:] = 0.0

        # ---- belt availability: old line until it dies; new line from open_month (line config only)
        belt_avail = (sc["fail"] > mo) | (cfg.capex == "line" and m >= p.open_month)

        # ---- core crew dispatch: (s,S) rule on the belt, then hand work, then top-up
        start = belt_avail & ~in_block & (stock < s)
        in_block = (in_block | start) & belt_avail
        block_len = np.where(in_block, block_len + 1, 0.0)
        in_block &= ~(in_block & (block_len > p.belt_min_block_days) & (stock >= S))
        belt_today = in_block.copy()

        core_hand_today = (cfg.core_hand == 1) & inhouse & ~belt_today & (W > 1e-9)
        topup = ~belt_today & ~core_hand_today & belt_avail & (stock < S)
        belt_today |= topup
        in_block |= topup
        block_len = np.where(topup & (block_len == 0), 1.0, block_len)

        cap_b = np.where(prev_belt, p.belt_rate, p.belt_rate * (1 - p.belt_changeover_days))
        prod = np.where(belt_today, np.minimum(cap_b, p.store_cap - stock), 0.0)
        stock = stock + prod
        prev_belt = belt_today
        tot["belt_days"] += belt_today
        tot["hand_days"] += core_hand_today

        # ---- builders (machine panels, price-driven, served from store)
        dem_b = base_b * loy_b * sc["b_level"][m] * sc["b_noise"][t]
        sold = np.minimum(stock, dem_b)
        stock = stock - sold
        unmet = dem_b - sold
        resale_vol = unmet if cfg.resale else 0.0
        gp_day = sold * gp_m + resale_vol * pm * p.resale_margin
        b_ot = sold + p.resale_ontime * resale_vol
        b_srv = sold + resale_vol

        # ---- projects (hand panels, quoted panel by panel)
        k = sc["k"][t] * loy_p
        sz = sc["size"][t] * loy_p
        A = sz / p.hand_rate + p.hand_setup_days * k          # crew-days of work arriving
        p_ot = np.zeros(n)
        p_srv = np.zeros(n)
        partner_vol = np.zeros(n)
        if cfg.project_mode == "partner_all":
            partner_vol = sz
        elif inhouse:
            lead = (W + 0.5 * A) / np.maximum(cap_rate, 0.05)
            accept = lead <= p.project_patience
            acc_vol = np.where(accept, sz, 0.0)
            W = W + np.where(accept, A, 0.0)
            V = V + acc_vol * gp_h
            p_ot += np.where(lead <= p.project_promise, acc_vol, 0.0)
            p_srv += acc_vol
            if cfg.project_mode == "overflow":
                partner_vol = np.where(accept, 0.0, sz)
        gp_day += partner_vol * ph * p.partner_project_margin
        p_ot += p.partner_project_ontime * partner_vol
        p_srv += partner_vol

        # ---- hand production: core crew (if dispatched) + extra crews
        ramp = 0.0 if m < p.open_month else (p.ramp_productivity if m < p.open_month + p.ramp_months else 1.0)
        cap_today = core_hand_today.astype(float) + cfg.extra_crews * ramp
        done = np.minimum(W, cap_today)
        frac = np.where(W > 1e-9, done / np.maximum(W, 1e-9), 0.0)
        realised = V * frac
        V = V - realised
        W = W - done
        gp_day += realised
        cap_rate = 0.85 * cap_rate + 0.15 * cap_today

        # ---- bookkeeping
        gp_month[m] += gp_day
        for key, val in (("b_dem", dem_b), ("b_ot", b_ot), ("b_srv", b_srv), ("p_dem", sz), ("p_ot", p_ot), ("p_srv", p_srv)):
            tot[key] += val
            if key in mon:
                mon[key] += val

        # ---- month end: customer feedback loop
        if t % D == D - 1:
            b_fill = mon["b_ot"] / np.maximum(mon["b_dem"], 1e-9)
            p_ok = np.where(mon["p_dem"] > 1e-9, mon["p_ot"] / np.maximum(mon["p_dem"], 1e-9), 1.0)
            loy_b = np.clip(loy_b * (1 - p.churn_stockout * (1 - b_fill)
                                     - p.cross_share * p.churn_cross * (1 - p_ok))
                            + p.loyalty_recovery * (1 - loy_b), p.loyalty_floor, 1.0)
            loy_p = np.clip(loy_p * (1 - p.churn_project * (1 - p_ok))
                            + p.loyalty_recovery * (1 - loy_p), p.loyalty_floor, 1.0)

    # ---- finance
    capex = p.capex_line if cfg.capex == "line" else p.capex_hall
    wage = cfg.extra_crews * p.crew_size * p.wage_month * (p.second_shift_premium if cfg.capex == "line" else 1.0)
    fixed = np.array([wage if mth >= p.open_month else 0.0 for mth in range(p.months)])
    fixed[p.open_month] += cfg.extra_crews * p.crew_size * p.hiring_cost_per_op
    df = (1 + rm) ** -(np.arange(p.months) + 1)
    residual = capex * max(0.0, 1 - (p.months / 12) / p.asset_life_years)
    npv = ((gp_month - fixed[:, None]) * df[:, None]).sum(0) - capex + residual * df[-1]

    b_sl = tot["b_ot"] / tot["b_dem"]
    p_sl = np.where(tot["p_dem"] > 0, tot["p_ot"] / np.maximum(tot["p_dem"], 1e-9), 1.0)
    cov = (tot["b_srv"] + tot["p_srv"]) / (tot["b_dem"] + tot["p_dem"])
    return dict(npv=npv, gp=gp_month.sum(0), b_sl=b_sl, p_sl=p_sl, sl_min=np.minimum(b_sl, p_sl), cov=cov,
                loy_b=loy_b, loy_p=loy_p, belt_days=tot["belt_days"], hand_days=tot["hand_days"],
                capex=capex)


def summarise(cfg: Config, r: dict, p: Params) -> dict:
    npv = r["npv"] / 1e9
    k = max(1, int(np.ceil(0.05 * len(npv))))
    return dict(
        family=cfg.family, label=cfg.label, capex_type=cfg.capex, extra_crews=cfg.extra_crews,
        core_hand=cfg.core_hand, project_mode=cfg.project_mode, resale=cfg.resale,
        reorder_s=cfg.reorder, order_up_to_S=cfg.order_up_to,
        capex_bn=r["capex"] / 1e9,
        E_NPV_bn=npv.mean(), SD_NPV_bn=npv.std(), P5_NPV_bn=np.percentile(npv, 5),
        CVaR5_NPV_bn=np.sort(npv)[:k].mean(), P95_NPV_bn=np.percentile(npv, 95),
        P_NPV_below_0=(npv < 0).mean(),
        E_GP_bn=(r["gp"] / 1e9).mean(),
        builder_ontime=r["b_sl"].mean(), project_ontime=r["p_sl"].mean(),
        weakest_side_ontime=r["sl_min"].mean(), coverage=r["cov"].mean(),
        builder_retention_end=r["loy_b"].mean(), project_retention_end=r["loy_p"].mean(),
        core_belt_days=r["belt_days"].mean(), core_hand_days=r["hand_days"].mean(),
    )


def run_all(p: Params, configs: list[Config], n_sims: int, seed: int, keep_paths=False, verbose=True):
    sc = draw_scenarios(p, n_sims, seed)
    rows, paths = [], {}
    t0 = time.time()
    for i, cfg in enumerate(configs):
        r = simulate(cfg, p, sc)
        rows.append(summarise(cfg, r, p))
        if keep_paths:
            paths[cfg.label] = r["npv"] / 1e9
        if verbose and (i + 1) % 25 == 0:
            print(f"   {i + 1}/{len(configs)} configs  ({time.time() - t0:.0f}s)", flush=True)
    return pd.DataFrame(rows), paths


# ----------------------------------------------------------------------------------
# 4. MULTI-OBJECTIVE RANKING
# ----------------------------------------------------------------------------------
OBJECTIVES = {            # column -> (direction, nice name)
    "E_NPV_bn": ("max", "Expected NPV (IDR bn)"),
    "CVaR5_NPV_bn": ("max", "Downside: mean of worst 5% NPV (IDR bn)"),
    "weakest_side_ontime": ("max", "Weakest-side on-time service"),
    "coverage": ("max", "Demand coverage (share of m2 served)"),
}
PROFILES = {              # weights over the four objectives
    "Profit-first":     dict(E_NPV_bn=0.60, CVaR5_NPV_bn=0.20, weakest_side_ontime=0.10, coverage=0.10),
    "Risk-averse":      dict(E_NPV_bn=0.25, CVaR5_NPV_bn=0.50, weakest_side_ontime=0.15, coverage=0.10),
    "Neither-side-lost": dict(E_NPV_bn=0.30, CVaR5_NPV_bn=0.20, weakest_side_ontime=0.30, coverage=0.20),
    "Coverage-first":   dict(E_NPV_bn=0.15, CVaR5_NPV_bn=0.10, weakest_side_ontime=0.30, coverage=0.45),
}


def pareto_levels(M: np.ndarray) -> np.ndarray:
    """Non-dominated sorting; M is (n_configs, n_objectives), all to be maximised. Level 1 = Pareto front."""
    n = len(M)
    level = np.zeros(n, int)
    remaining = np.arange(n)
    lv = 1
    while len(remaining):
        sub = M[remaining]
        dominated = np.array([
            np.any(np.all(sub >= sub[i] - 1e-12, axis=1) & np.any(sub > sub[i] + 1e-12, axis=1))
            for i in range(len(remaining))])
        level[remaining[~dominated]] = lv
        remaining = remaining[dominated]
        lv += 1
    return level


def add_rankings(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    cols = list(OBJECTIVES)
    for c in cols:
        df[f"rank_{c}"] = df[c].rank(ascending=False, method="min").astype(int)
    df["pareto_level"] = pareto_levels(df[cols].to_numpy())
    norm = (df[cols] - df[cols].min()) / (df[cols].max() - df[cols].min()).replace(0, 1)
    for name, w in PROFILES.items():
        df[f"score_{name}"] = sum(norm[c] * w[c] for c in cols)
        df[f"rank_{name}"] = df[f"score_{name}"].rank(ascending=False, method="min").astype(int)
    rank_cols = [f"rank_{name}" for name in PROFILES]
    df["avg_rank_profiles"] = df[rank_cols].mean(axis=1)
    df["worst_rank_profiles"] = df[rank_cols].max(axis=1)
    return df.sort_values("avg_rank_profiles").reset_index(drop=True)


# ----------------------------------------------------------------------------------
# 5. SENSITIVITY: who wins when the assumptions move?
# ----------------------------------------------------------------------------------
SCENARIOS = {
    "Base case": {},
    "No cross-sell churn (gamma=0)": dict(churn_cross=0.0),
    "Strong cross-sell churn (gamma=0.4)": dict(churn_cross=0.40),
    "Builder price war (-5% price)": dict(machine_price_shock=0.05),
    "Builders -20% demand": dict(demand_total_month=11_000 * (1 - 0.6 * 0.2)),   # builder volume down 20%
    "Slow crew ramp-up (30% for 4 mo)": dict(ramp_months=4, ramp_productivity=0.3),
    "Old line dies early (m1-6)": dict(fail_max=6.0),
    "Unreliable partner (40-50% on time)": dict(partner_project_ontime=0.4, resale_ontime=0.5),
    "Expensive labour (2x wage)": dict(wage_month=10.0e6),
}


def run_sensitivity(p: Params, configs, n_sims, seed, verbose=True):
    rows = []
    for name, over in SCENARIOS.items():
        ps = replace(p, **over)
        if verbose:
            print(f" scenario: {name}", flush=True)
        df, _ = run_all(ps, configs, n_sims, seed + 1, verbose=False)
        df = add_rankings(df)
        for fam, g in df.groupby("family"):
            best = g.sort_values("E_NPV_bn", ascending=False).iloc[0]
            rows.append(dict(scenario=name, family=fam, best_E_NPV_bn=best["E_NPV_bn"],
                             best_P5_NPV_bn=best["P5_NPV_bn"], best_label=best["label"],
                             best_overall_rank_profit=int(best["rank_Profit-first"])))
        top = df.sort_values("E_NPV_bn", ascending=False).iloc[0]
        rows.append(dict(scenario=name, family="** overall winner (E[NPV]) **", best_E_NPV_bn=top["E_NPV_bn"],
                         best_P5_NPV_bn=top["P5_NPV_bn"], best_label=top["label"], best_overall_rank_profit=1))
    return pd.DataFrame(rows)


# ----------------------------------------------------------------------------------
# 6. REPORTING
# ----------------------------------------------------------------------------------
def make_plots(df: pd.DataFrame, paths: dict, sens: pd.DataFrame | None, outdir: str):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    colors = {"Machine-focused": "#1f77b4", "Split (line + in-house hand)": "#2ca02c", "Hand-focused (hall)": "#d62728"}

    # --- Fig 1: trade-off space (every configuration) ---
    fig, ax = plt.subplots(1, 3, figsize=(17, 5.2))
    for fam, g in df.groupby("family"):
        ax[0].scatter(g["E_NPV_bn"], g["weakest_side_ontime"], s=18 + 140 * g["coverage"] ** 3, alpha=.55,
                      c=colors[fam], label=fam, edgecolor="none")
        ax[1].scatter(g["E_NPV_bn"], g["CVaR5_NPV_bn"], s=28, alpha=.55, c=colors[fam], edgecolor="none")
        ax[2].scatter(g["E_NPV_bn"], g["coverage"], s=28, alpha=.55, c=colors[fam], edgecolor="none")
    front = df[df["pareto_level"] == 1]
    for a, y in zip(ax, ("weakest_side_ontime", "CVaR5_NPV_bn", "coverage")):
        a.scatter(front["E_NPV_bn"], front[y], s=95, facecolor="none", edgecolor="black", lw=1.2)
        a.set_xlabel("Expected NPV, 24 months (IDR bn)")
    ax[0].set_ylabel("Weakest-side on-time service  (bubble = coverage)")
    ax[1].set_ylabel("Downside: mean of worst 5% NPV (IDR bn)")
    ax[2].set_ylabel("Demand coverage")
    ax[0].legend(fontsize=8, loc="lower left")
    fig.suptitle(f"All {len(df)} configurations; black rings = Pareto front on the 4 objectives", fontweight="bold")
    fig.tight_layout()
    fig.savefig(os.path.join(outdir, "fig1_tradeoff_space.png"), dpi=140)
    plt.close(fig)

    # --- Fig 2: range of outcomes per family + NPV distributions of representative configs ---
    fig, ax = plt.subplots(1, 2, figsize=(17, 6))
    fams = list(colors)
    data = [df[df.family == f]["E_NPV_bn"].values for f in fams]
    # version-proof: no 'labels'/'tick_labels' keyword (renamed in matplotlib 3.9); set ticks afterwards
    bp = ax[0].boxplot(data, patch_artist=True, widths=.5)
    ax[0].set_xticks(range(1, len(fams) + 1))
    ax[0].set_xticklabels([f.replace(" (", "\n(") for f in fams])
    for patch, f in zip(bp["boxes"], fams):
        patch.set_facecolor(colors[f])
        patch.set_alpha(.5)
    for i, f in enumerate(fams, 1):
        v = df[df.family == f]["E_NPV_bn"].values
        ax[0].scatter(np.random.default_rng(1).normal(i, .05, len(v)), v, s=9, c="k", alpha=.35)
    ax[0].set_ylabel("Expected NPV (IDR bn)")
    ax[0].set_title("Range of E[NPV] inside each family (every dot = one configuration)")

    picks = {}
    for fam in fams:
        g = df[df.family == fam]
        picks[f"{fam.split(' (')[0]} - best E[NPV]"] = g.sort_values("E_NPV_bn", ascending=False).iloc[0]["label"]
        picks[f"{fam.split(' (')[0]} - median"] = g.sort_values("E_NPV_bn").iloc[len(g) // 2]["label"]
        picks[f"{fam.split(' (')[0]} - worst"] = g.sort_values("E_NPV_bn").iloc[0]["label"]
    names = list(picks)
    vp = ax[1].violinplot([paths[picks[k]] for k in names], showmedians=True, vert=False)
    for body, k in zip(vp["bodies"], names):
        body.set_facecolor(colors[[f for f in fams if f.startswith(k.split(" - ")[0])][0]])
        body.set_alpha(.5)
    ax[1].set_yticks(range(1, len(names) + 1))
    ax[1].set_yticklabels(names, fontsize=8)
    ax[1].invert_yaxis()
    ax[1].set_xlabel("NPV per simulated 24-month path (IDR bn)")
    ax[1].set_title("Full NPV distributions: best / median / worst of each family")
    fig.tight_layout()
    fig.savefig(os.path.join(outdir, "fig2_range_of_outcomes.png"), dpi=140)
    plt.close(fig)

    # --- Fig 3: rank heatmap, top 20 by average rank across profiles ---
    top = df.head(20)
    cols = [f"rank_{c}" for c in OBJECTIVES] + [f"rank_{n}" for n in PROFILES]
    M = top[cols].to_numpy()
    fig, ax = plt.subplots(figsize=(13, 8.5))
    im = ax.imshow(M, cmap="RdYlGn_r", aspect="auto", vmin=1, vmax=max(40, M.max()))
    ax.set_xticks(range(len(cols)))
    ax.set_xticklabels([c.replace("rank_", "").replace("_bn", "").replace("_", " ") for c in cols], rotation=35, ha="right")
    ax.set_yticks(range(len(top)))
    ax.set_yticklabels([f"{i + 1}. {l[:75]}" for i, l in enumerate(top["label"])], fontsize=7.5)
    for i in range(M.shape[0]):
        for j in range(M.shape[1]):
            ax.text(j, i, M[i, j], ha="center", va="center", fontsize=7)
    ax.set_title(f"Rank (1 = best of {len(df)}) of the 20 most robust configurations, under each objective and weighting")
    fig.colorbar(im, shrink=.6, label="rank")
    fig.tight_layout()
    fig.savefig(os.path.join(outdir, "fig3_rank_heatmap.png"), dpi=140)
    plt.close(fig)

    # --- Fig 4: sensitivity ---
    if sens is not None:
        piv = sens[~sens.family.str.startswith("**")].pivot(index="scenario", columns="family", values="best_E_NPV_bn")
        piv = piv.loc[list(SCENARIOS)]
        fig, ax = plt.subplots(figsize=(11, 5.5))
        im = ax.imshow(piv.to_numpy(), cmap="YlGn", aspect="auto")
        ax.set_xticks(range(piv.shape[1]))
        ax.set_xticklabels([c.replace(" (", "\n(") for c in piv.columns])
        ax.set_yticks(range(piv.shape[0]))
        ax.set_yticklabels(piv.index)
        for i in range(piv.shape[0]):
            win = np.argmax(piv.iloc[i].to_numpy())
            for j in range(piv.shape[1]):
                ax.text(j, i, f"{piv.iloc[i, j]:.1f}" + (" *" if j == win else ""), ha="center", va="center",
                        fontweight="bold" if j == win else "normal")
        ax.set_title("Best E[NPV] (IDR bn) achievable by each family under each assumption set   (* = winner)")
        fig.colorbar(im, label="IDR bn")
        fig.tight_layout()
        fig.savefig(os.path.join(outdir, "fig4_sensitivity.png"), dpi=140)
        plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-sims", type=int, default=400)
    ap.add_argument("--sens-sims", type=int, default=150)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", default="results")          # relative folder, works on Windows/Linux/Mac
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--no-sens", action="store_true")
    a = ap.parse_args()
    if a.quick:
        a.n_sims, a.sens_sims = 100, 60
    os.makedirs(a.out, exist_ok=True)

    p = Params()
    configs = enumerate_configs()
    print(f"{len(configs)} feasible configurations x {a.n_sims} Monte Carlo paths x {p.months * p.days_per_month} days")
    t0 = time.time()
    df, paths = run_all(p, configs, a.n_sims, a.seed, keep_paths=True)
    df = add_rankings(df)
    print(f"base run done in {time.time() - t0:.0f}s")

    sens = None
    if not a.no_sens:
        print("sensitivity runs:")
        sens = run_sensitivity(p, configs, a.sens_sims, a.seed)

    # ---- save
    df.to_csv(os.path.join(a.out, "results_all_configs.csv"), index=False)
    fam = (df.groupby("family").agg(
        n_configs=("label", "count"),
        E_NPV_min=("E_NPV_bn", "min"), E_NPV_median=("E_NPV_bn", "median"), E_NPV_max=("E_NPV_bn", "max"),
        CVaR5_best=("CVaR5_NPV_bn", "max"), CVaR5_worst=("CVaR5_NPV_bn", "min"),
        weakest_side_min=("weakest_side_ontime", "min"), weakest_side_max=("weakest_side_ontime", "max"),
        coverage_min=("coverage", "min"), coverage_max=("coverage", "max"),
        on_pareto_front=("pareto_level", lambda s: int((s == 1).sum()))).round(3))
    try:
        with pd.ExcelWriter(os.path.join(a.out, "results_all_configs.xlsx")) as xw:
            df.to_excel(xw, sheet_name="all_configs_ranked", index=False)
            fam.to_excel(xw, sheet_name="family_ranges")
            df[df.pareto_level == 1].to_excel(xw, sheet_name="pareto_front", index=False)
            if sens is not None:
                sens.to_excel(xw, sheet_name="sensitivity", index=False)
            pd.DataFrame([vars(p)]).T.rename(columns={0: "value"}).to_excel(xw, sheet_name="assumptions")
    except Exception as e:  # openpyxl missing etc.
        print("xlsx not written:", e)
    make_plots(df, paths, sens, a.out)

    pd.set_option("display.width", 250, "display.max_colwidth", 95, "display.max_rows", 500)
    show = ["label", "E_NPV_bn", "CVaR5_NPV_bn", "weakest_side_ontime", "coverage", "pareto_level", "avg_rank_profiles"]
    print("\n=== FAMILY RANGES (min / median / max over configurations) ===")
    print(fam.to_string())
    for c, (_, nice) in OBJECTIVES.items():
        print(f"\n=== RANK BY: {nice}  (top 5 / bottom 3 of {len(df)}) ===")
        s = df.sort_values(c, ascending=False)
        print(pd.concat([s.head(5), s.tail(3)])[show].round(3).to_string(index=False))
    print("\n=== PARETO FRONT (level 1) ===")
    print(df[df.pareto_level == 1].sort_values("E_NPV_bn", ascending=False)[show].round(3).to_string(index=False))
    if sens is not None:
        print("\n=== SENSITIVITY: winner per scenario ===")
        print(sens[sens.family.str.startswith("**")][["scenario", "best_E_NPV_bn", "best_label"]].round(2).to_string(index=False))
    df.to_pickle(os.path.join(a.out, "df.pkl"))
    if sens is not None:
        sens.to_pickle(os.path.join(a.out, "sens.pkl"))
    print(f"\nAll outputs saved in: {os.path.abspath(a.out)}")


if __name__ == "__main__":
    main()