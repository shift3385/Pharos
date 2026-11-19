# k6 samples (ING-06)

Real output of k6 v2.4.0 (the official Windows build from grafana/k6, checksum
checked, run only; k6 is AGPL and no file of its repository is copied here),
generated on 2026-11-18 with [`pharos-api.js`](pharos-api.js): 5 virtual users
for 10 s against the Pharos API of this branch on `127.0.0.1:3100`. The
summaries are ours.

| File                  | Shape                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `handle-summary.json` | The `data` of `handleSummary`, written with `JSON.stringify` (`type`, `contains`, `values`, thresholds as `{ ok }`). |
| `summary-export.json` | `--summary-export`, the legacy flat shape (values beside the metric, thresholds as booleans).                        |

The script makes one threshold fail on purpose (`http_req_failed`: half the
requests go to a route that answers 404). It also tags a sub-metric
`{case:TC-1}` and names a check `… @TC-1`, and puts a threshold on `p(99)`,
which is not in `summaryTrendStats`.

What the real export showed: **in `--summary-export` a threshold is `true`
when it was crossed (failed)**, the opposite of `handleSummary`'s `ok`. Both
files give the same metrics (a contract test checks it).

`normalized/` holds the Pharos Run JSON each one produces.
