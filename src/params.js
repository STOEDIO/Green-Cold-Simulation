import { fmt } from "./lib.js";

// source: "brief" = Table 1 of the case brief, "ours" = team assumption
export const PARAM_GROUPS = [
  ["Market and prices", [
    ["price_machine", "Machine panel price, IDR per m²", 200000, 400000, 10000, (v) => fmt.int(v), "ours"],
    ["machine_price_shock", "Builder price cut (cost unchanged)", 0, 0.1, 0.005, fmt.pct1, "ours"],
    ["demand_total_month", "Total demand, m² per month", 7000, 16000, 250, fmt.int, "brief"],
    ["share_builder", "Builder share of demand", 0.3, 0.8, 0.01, fmt.pct, "brief"],
    ["builder_level_cv", "Builder demand swing, month to month", 0, 0.4, 0.01, fmt.pct, "ours"],
    ["project_level_cv", "Project demand swing, month to month", 0, 0.6, 0.01, fmt.pct, "ours"],
    ["project_mean_size", "Average project size, m²", 30, 400, 10, fmt.int, "ours"],
  ]],
  ["Plant", [
    ["gm_machine", "Machine gross margin", 0.08, 0.3, 0.01, fmt.pct, "brief"],
    ["gm_hand", "Hand gross margin", 0.15, 0.4, 0.01, fmt.pct, "brief"],
    ["hand_rate", "Hand output, m² per crew-day", 60, 200, 5, fmt.int, "brief"],
    ["store_cap", "Store capacity, m²", 1000, 4000, 100, fmt.int, "brief"],
    ["fail_max", "Old line fails by month (at random before this)", 1.5, 24, 0.5, (v) => v.toFixed(1), "ours"],
    ["open_month", "New line, hall or second shift ready in month", 1, 8, 1, (v) => String(v + 1), "ours"],
    ["ramp_productivity", "New crew productivity, first two months", 0.1, 1, 0.05, fmt.pct, "ours"],
  ]],
  ["Labour and money", [
    ["capex_line", "New line, IDR billion", 2e9, 5e9, 0.1e9, (v) => (v / 1e9).toFixed(1), "brief"],
    ["capex_hall", "Hand hall, IDR billion", 1e9, 4e9, 0.1e9, (v) => (v / 1e9).toFixed(1), "brief"],
    ["wage_month", "Wage per operator, IDR million per month", 2.5e6, 15e6, 0.5e6, (v) => (v / 1e6).toFixed(1), "ours"],
    ["second_shift_premium", "Second-shift wage multiplier", 1, 2, 0.05, (v) => `×${v.toFixed(2)}`, "ours"],
    ["hiring_cost_per_op", "Hiring and training per operator, IDR million", 0, 50e6, 1e6, (v) => (v / 1e6).toFixed(0), "ours"],
    ["discount_annual", "Discount rate per year", 0.04, 0.25, 0.005, fmt.pct1, "ours"],
  ]],
  ["Partners", [
    ["overflow_quote_max", "Send a project to a partner if our quote is over, days", 6, 24, 1, fmt.int, "ours"],
    ["partner_cap_month", "Partner capacity, m² a month", 200, 3200, 100, (v) => (v >= 1e11 ? "No limit" : fmt.int(v)), "ours",
      { toSlider: (v) => Math.min(v, 3200), toParam: (v) => (v >= 3200 ? 1e12 : v) }],
    ["partner_project_ontime", "Project partner delivers on time", 0.2, 1, 0.05, fmt.pct, "ours"],
    ["partner_project_margin", "Margin we keep on partnered projects", 0, 0.2, 0.01, fmt.pct, "ours"],
    ["resale_ontime", "Resold builder panels on time", 0.2, 1, 0.05, fmt.pct, "ours"],
    ["resale_margin", "Margin on resold panels", 0, 0.15, 0.01, fmt.pct, "ours"],
  ]],
  ["Customers", [
    ["churn_cross", "Builder loss when mixed orders' projects are late (γ)", 0, 0.6, 0.01, (v) => v.toFixed(2), "ours"],
    ["cross_share", "Builder volume from mixed accounts", 0, 0.7, 0.01, fmt.pct, "ours"],
    ["churn_stockout", "Builder loss per unit of stock-out", 0, 0.8, 0.01, (v) => v.toFixed(2), "ours"],
    ["churn_project", "Project client loss per unit of lateness", 0, 0.5, 0.01, (v) => v.toFixed(2), "ours"],
    ["project_patience", "Project client walks away above, days", 12, 48, 1, fmt.int, "ours"],
  ]],
];
