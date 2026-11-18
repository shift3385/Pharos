// k6 sample for Pharos's ING-06 contract tests: the local API on port 3100.
import http from "k6/http";
import { check, group } from "k6";

export const options = {
  vus: 5,
  duration: "10s",
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)"],
  thresholds: {
    // Passes: the health check answers fast on localhost.
    "http_req_duration{expected_response:true}": ["p(95)<2000"],
    // Fails on purpose: no request is allowed to fail, and one route is a 404.
    http_req_failed: ["rate<0.0001"],
    // A sub-metric linked to a case, and a threshold on an aggregation that
    // the summary does not list (p(99) is not in summaryTrendStats).
    "http_req_duration{case:TC-1}": ["p(95)<1500", "p(99)<3000"],
    checks: ["rate>0.9"],
  },
};

export default function () {
  group("Salud", () => {
    const r = http.get("http://127.0.0.1:3100/health", { tags: { case: "TC-1" } });
    check(r, { "status es 200 @TC-1": (x) => x.status === 200 });
  });
  group("Rutas", () => {
    const r = http.get("http://127.0.0.1:3100/no-existe");
    check(r, { "responde 404": (x) => x.status === 404, "trae JSON": (x) => (x.headers["Content-Type"] || "").includes("json") });
  });
}

export function handleSummary(data) {
  return { "handle-summary.json": JSON.stringify(data, null, 2) };
}
