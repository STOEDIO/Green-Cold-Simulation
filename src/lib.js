import { useLayoutEffect, useRef, useState } from "react";

export const FAMILIES = ["Machine", "Hand", "Split"];
export const FAMILY_NAME = { Machine: "A. Machine-focused", Hand: "B. Hand-focused", Split: "C. Split by rule" };
export const FAMILY_COLOR = { Machine: "var(--machine)", Hand: "var(--hand)", Split: "var(--split)" };

export const fmt = {
  bn: (v) => v.toFixed(2),
  bn1: (v) => v.toFixed(1),
  pct: (v) => `${(v * 100).toFixed(0)}%`,
  pct1: (v) => `${(v * 100).toFixed(1)}%`,
  int: (v) => Math.round(v).toLocaleString("en-US"),
};

export const bestBy = (rows, f) => rows.reduce((a, b) => (f(b) > f(a) ? b : a));
export const recommended = (rows) => bestBy(rows, (r) => -r.avg_rank_profiles);
// Best version of each option by value created. For the recommended option's family we show the
// recommended set-up itself, so a near-tie in value can't make the pages quote different versions.
export const familyBests = (rows) => {
  const rec = recommended(rows);
  return Object.fromEntries(FAMILIES.map((f) => [
    f,
    f === rec.family ? rec : bestBy(rows.filter((r) => r.family === f), (r) => r.E_NPV_bn),
  ]));
};
export const overallRank = (rows, r) => 1 + rows.filter((x) => x.avg_rank_profiles < r.avg_rank_profiles).length;

const ROUTE = {
  inhouse: "projects in-house",
  overflow: "projects in-house, overflow to partner",
  partner_all: "all projects to partner",
  drop: "projects turned away",
};

// A set-up described the way you'd say it out loud.
export function describe(r) {
  const plant = r.capex_type === "line" ? "New line" : "Hand hall";
  const crew = r.extra_crews === 0
    ? "no new crew"
    : r.capex_type === "line" ? "second-shift crew" : `${r.extra_crews} new crew${r.extra_crews > 1 ? "s" : ""}`;
  const core = r.core_hand ? "day crew builds hand panels on spare days" : "day crew on the belt only";
  return `${plant}, ${crew}; ${core}; ${ROUTE[r.project_mode]}; ${r.resale ? "resells partner panels when short" : "no resale"}; stock rule ${r.reorder_s}/${r.order_up_to_S} m²`;
}
export function shortDescribe(r) {
  const plant = r.capex_type === "line" ? "Line" : "Hall";
  const crew = r.extra_crews ? (r.capex_type === "line" ? " + 2nd shift" : ` + ${r.extra_crews} crew`) : "";
  return `${plant}${crew}, ${ROUTE[r.project_mode]}, ${r.resale ? "resale" : "no resale"}, ${r.reorder_s}/${r.order_up_to_S}`;
}

export function scale(d0, d1, r0, r1) {
  const f = (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
  f.invert = (px) => d0 + ((px - r0) / (r1 - r0)) * (d1 - d0);
  return f;
}
export function ticks(lo, hi, n) {
  const span = hi - lo || 1;
  const mag = Math.pow(10, Math.floor(Math.log10(span / n)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

// Width of an element, kept up to date.
export function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current, cs = getComputedStyle(el);
    setW(Math.floor(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)));
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function linePath(values, x, y) {
  let d = "";
  values.forEach((v, i) => { d += `${i ? "L" : "M"}${x(i + 0.5).toFixed(1)} ${y(v).toFixed(1)}`; });
  return d;
}
