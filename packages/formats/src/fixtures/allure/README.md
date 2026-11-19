# Allure samples (ING-07)

`playwright/` is a real `allure-results` folder, written on 2026-11-19 by
**allure-playwright 3.15.0** (Apache-2.0) under **@playwright/test 1.65.1**,
both installed outside the repo (no browsers: the specs open no page). It
comes from the three small specs in `specs/` with `retries: 1`:

- a passed test with two steps, a nested `expect`, a text attachment, a
  `@TC-001` in its title and a `tms` link;
- a failed test tagged `TC-002`, retried and failed again;
- a test that fails, then passes on its retry (flaky);
- one test run with two `qty` parameters;
- a skipped test and a test that throws.

What named the machine was rewritten: the `host` label (`ci-runner`), the
worker pid, the project folder (`app`) and the absolute paths in traces
(`/home/runner/work/app/`). File names and everything else are as written.

allure-playwright writes no `*-container.json`; the container rule (a failed
fixture fails its children) is covered in `allure.test.ts` with a small
folder.

`normalized/playwright.json` holds the Pharos Run JSON it produces.
