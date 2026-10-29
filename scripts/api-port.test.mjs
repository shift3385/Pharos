import { test } from "node:test";
import assert from "node:assert/strict";
import { apiPort, belongsTo, isPharosApi, parseNetstat } from "./api-port.mjs";

const repo = "D:\\MI_AREA_DE_QA\\Suite de pruebas\\pharos";
const worktree = `${repo}\\.claude\\worktrees\\a3-datos-sync-4dadd9`;
// The listening process of `npm start` (tsx's child), as Windows reports it.
const tsxChild = (dir) =>
  `"C:\\Program Files\\nodejs\\node.exe" --require "${dir}\\server\\node_modules\\tsx\\dist\\preflight.cjs" --import file:///${dir.replace(/\\/g, "/").replace(/ /g, "%20")}/server/node_modules/tsx/dist/loader.mjs src/server.ts`;

test("apiPort: PORT from the environment, then .env, then 3000", () => {
  assert.equal(apiPort({ PORT: "4000" }, "PORT=5000"), 4000);
  assert.equal(apiPort({}, "HOST=0.0.0.0\nPORT=5000\n"), 5000);
  assert.equal(apiPort({}, ""), 3000);
  assert.equal(apiPort({ PORT: "nope" }, ""), 3000);
});

test("isPharosApi: the API of any Pharos checkout, nothing else", () => {
  assert.ok(isPharosApi(tsxChild(repo), repo));
  assert.ok(isPharosApi(tsxChild(worktree), repo));
  // Another project's tsx server, a Vite dev server, Postgres: not ours.
  assert.ok(!isPharosApi(tsxChild("D:\\work\\shop-api"), repo));
  assert.ok(
    !isPharosApi(`node ${repo}\\node_modules\\vite\\bin\\vite.js`, repo),
  );
  assert.ok(
    !isPharosApi(
      '"C:\\Program Files\\PostgreSQL\\18\\bin\\postgres.exe"',
      repo,
    ),
  );
  assert.ok(!isPharosApi("", repo));
});

test("isPharosApi: this checkout counts even if its folder is not named pharos", () => {
  const plain = "D:\\code\\qa-suite";
  assert.ok(isPharosApi(tsxChild(plain), plain));
});

test("belongsTo: a worktree's API is not the main checkout's, and vice versa", () => {
  assert.ok(belongsTo(tsxChild(repo), repo));
  assert.ok(!belongsTo(tsxChild(worktree), repo));
  assert.ok(belongsTo(tsxChild(worktree), worktree));
  assert.ok(!belongsTo(tsxChild(repo), worktree));
  assert.ok(belongsTo(tsxChild(repo), `${repo}\\`));
});

test("parseNetstat: only TCP listeners on exactly that port", () => {
  const out = [
    "Active Connections",
    "",
    "  Proto  Local Address          Foreign Address        State           PID",
    "  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       22940",
    "  TCP    [::]:3000              [::]:0                 LISTENING       22940",
    "  TCP    0.0.0.0:30001          0.0.0.0:0              LISTENING       111",
    "  TCP    127.0.0.1:3000         127.0.0.1:50000        ESTABLISHED     222",
    "  TCP    0.0.0.0:1420           0.0.0.0:0              LISTENING       333",
  ].join("\r\n");
  assert.deepEqual(parseNetstat(out, 3000), [22940]);
  assert.deepEqual(parseNetstat(out, 1420), [333]);
  assert.deepEqual(parseNetstat(out, 8080), []);
});
