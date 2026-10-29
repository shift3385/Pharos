import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkMigrations,
  parseRegistered,
  staleReservations,
} from "./check-migrations.mjs";

/** db.rs entries whose name matches the included file. */
const reg = (names) => names.map((n) => ({ name: n, file: n }));

const files = ["0001_init.sql", "0002_documents.sql", "0003_documents_hlc.sql"];

test("a contiguous, well-named set passes", () => {
  assert.deepEqual(checkMigrations({ label: "server", files }), []);
});

test("two migrations sharing a number fail", () => {
  const errors = checkMigrations({
    label: "server",
    files: [...files, "0003_other.sql"],
  });
  assert.equal(errors.length, 1);
  assert.match(
    errors[0],
    /number 0003 is used by 0003_documents_hlc\.sql, 0003_other\.sql/,
  );
});

test("a gap fails unless the number is reserved or retired", () => {
  const withGap = ["0001_init.sql", "0003_documents_hlc.sql"];
  assert.match(
    checkMigrations({ label: "server", files: withGap })[0],
    /0002 is missing/,
  );
  assert.deepEqual(
    checkMigrations({
      label: "server",
      files: withGap,
      reserved: { "0002": "A1" },
    }),
    [],
  );
  assert.deepEqual(
    checkMigrations({
      label: "server",
      files: withGap,
      retired: { "0002": "dropped" },
    }),
    [],
  );
});

test("reserved numbers above the highest file are not gaps", () => {
  assert.deepEqual(
    checkMigrations({
      label: "server",
      files,
      reserved: { "0004": "A1", "0006": "A2" },
    }),
    [],
  );
});

test("a retired number must not have a file", () => {
  const errors = checkMigrations({
    label: "server",
    files,
    retired: { "0002": "dropped" },
  });
  assert.match(errors[0], /0002 is retired/);
});

test("badly named .sql files fail; other files are ignored", () => {
  const errors = checkMigrations({
    label: "server",
    files: [...files, "4_bad.sql", "0004_Bad-Name.sql", "README.md"],
  });
  assert.equal(errors.length, 2);
});

test("local: files and db.rs registration must match, in order", () => {
  const registered = reg(["0001_init.sql", "0002_documents.sql"]);
  const errors = checkMigrations({ label: "local", files, registered });
  assert.deepEqual(errors, [
    "local: 0003_documents_hlc.sql is not registered in db.rs MIGRATIONS (it would never run)",
  ]);
  const extra = checkMigrations({
    label: "local",
    files,
    registered: reg([...files, "0004_ghost.sql"]),
  });
  assert.match(extra[0], /registers 0004_ghost\.sql/);
  const unordered = checkMigrations({
    label: "local",
    files,
    registered: reg([files[1], files[0], files[2]]),
  });
  assert.match(unordered[0], /not in ascending order/);
});

test("parseRegistered reads include_str! entries, including multi-line ones", () => {
  const src = `const MIGRATIONS: &[(&str, &str)] = &[
    ("0001_init.sql", include_str!("../migrations/0001_init.sql")),
    (
        "0002_test_plans.sql",
        include_str!("../migrations/0002_test_plans.sql"),
    ),
];`;
  assert.deepEqual(parseRegistered(src), [
    { name: "0001_init.sql", file: "0001_init.sql" },
    { name: "0002_test_plans.sql", file: "0002_test_plans.sql" },
  ]);
});

test("local: an entry whose name differs from its included file fails", () => {
  const src = `("0002_documents.sql", include_str!("../migrations/0002_typo.sql")),`;
  const registered = [
    ...reg(["0001_init.sql"]),
    ...parseRegistered(src),
    ...reg(["0003_documents_hlc.sql"]),
  ];
  const errors = checkMigrations({ label: "local", files, registered });
  assert.ok(
    errors.includes(
      'local: db.rs registers "0002_documents.sql" with include_str!("0002_typo.sql"); the name must match the file',
    ),
    errors.join("\n"),
  );
});

test("reserved numbers that already have a file are reported", () => {
  assert.deepEqual(
    staleReservations({ files, reserved: { "0003": "A1", "0004": "A1" } }),
    ["0003"],
  );
});
