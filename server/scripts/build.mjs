// `npm run build` (DEU-01, ADR-0052 «A5»): compiles the server to dist/ with
// tsc. The shared @pharos/formats (ADR-0053) is not an npm dependency (the
// app, tsx and vitest load its sources through aliases), so it is compiled
// first into dist/node_modules/@pharos/formats: Node finds it there from any
// file in dist/, and its own imports (zod, uuid) resolve from the server's
// node_modules one level up. dist/ is rebuilt from scratch every time.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const server = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(server, "dist");
const formatsOut = join(dist, "node_modules", "@pharos", "formats");
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");

function run(args) {
  execFileSync(process.execPath, [tsc, ...args], { cwd: server, stdio: "inherit" });
}

rmSync(dist, { recursive: true, force: true });

// The package's own tsconfig, emitting, with zod and uuid taken from the
// server's node_modules: the repo root's may not be installed (CI, Docker).
mkdirSync(dist, { recursive: true });
const formatsConfig = join(dist, "formats.tsconfig.json");
const modules = join(server, "node_modules");
writeFileSync(
  formatsConfig,
  JSON.stringify({
    extends: join(server, "..", "packages", "formats", "tsconfig.json"),
    compilerOptions: {
      noEmit: false,
      declaration: true,
      outDir: formatsOut,
      rootDir: join(server, "..", "packages", "formats", "src"),
      typeRoots: [join(modules, "@types")],
      paths: { zod: [join(modules, "zod")], uuid: [join(modules, "uuid")] },
    },
  }),
);
run(["-p", formatsConfig]);
rmSync(formatsConfig);
writeFileSync(
  join(formatsOut, "package.json"),
  `${JSON.stringify({ name: "@pharos/formats", private: true, type: "module", exports: "./index.js" }, null, 2)}\n`,
);

run(["-p", "tsconfig.build.json"]);
console.log("Built dist/ (node dist/server.js)");
