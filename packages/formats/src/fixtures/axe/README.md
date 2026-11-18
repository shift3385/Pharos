# axe-core samples (ING-06)

Real output of `axe.run(document)` with axe-core 4.14.0 (MPL-2.0, already a
dependency of Pharos) under jsdom 25, with its default rules, generated on
2026-11-18 by a one-off vitest script. The output is ours; no third-party
fixture is copied.

| File | What was audited |
| --- | --- |
| `pharos-dialog.json` | The real «Nuevo requisito» dialog of Pharos (`RequirementFormModal`, Spanish). It gives one serious violation (`document-title`, since a dialog rendered alone has no `<title>`), `color-contrast` as incomplete (jsdom has no layout), 27 passes and 61 inapplicable rules. |
| `checkout-broken.json` | A small page of ours with known faults: an image without `alt`, an unnamed input, button and link, low contrast, a `div` acting as a button and a broken list. It gives critical and serious violations and three incomplete rules. |

The `@axe-core/cli` array shape (one result per page) is built in the test
from these two files.

`normalized/` holds the Pharos Run JSON each one produces. Any change to it
is a change of the parser's output (`NORMALIZER_VERSION`, VERSIONING §6.5).
