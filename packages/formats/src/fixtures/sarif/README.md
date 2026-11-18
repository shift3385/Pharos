# SARIF samples (ING-06)

Real SARIF 2.1.0 logs, generated on 2026-11-18 or copied with their licence.
The absolute roots of the generated ones were rewritten to a GitHub Actions
workspace (`file:///home/runner/work/Pharos/Pharos/`), which is where they
would come from in CI; nothing else was edited.

| File                           | Origin                                                                                                                                                                                                                                                                                                                                    | Licence                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `eslint.sarif`                 | ESLint 8.57.1 on `src/modules/runs` of Pharos, with four stricter rules added on the command line (`complexity` as error, `no-console`, `max-depth`, `no-nested-ternary` as warnings) so that clean code gives results, written by `@microsoft/eslint-formatter-sarif` 3.1.0. 48 results, `warning` and `error`, absolute `file://` URIs. | Output of Pharos's own code                 |
| `trivy-misconfig.sarif`        | Trivy 0.76.2 (official Windows build, checksum checked) `fs --scanners misconfig` on a copy of `server/` and the lockfiles. Two real findings on `server/Dockerfile`: DS002 (the image runs as root, HIGH, `security-severity` 8.0) and DS026 (no `HEALTHCHECK`), with a `ROOTPATH` `uriBaseId`.                                          | Output of Pharos's own code                 |
| `sarif-sdk-suppressions.sarif` | `src/Test.UnitTests.Sarif/TestData/Baseline/SuppressionTestCurrent.sarif` of [microsoft/sarif-sdk](https://github.com/microsoft/sarif-sdk) at `724b6a886914`, byte for byte (it starts with a BOM). External `suppressions` and Windows drive-letter URIs.                                                                                | MIT, © Microsoft Corporation (notice below) |

Trivy's vulnerability scan (CVEs) was not used: its 134 MB database download
failed twice at the end. The misconfiguration scan gives the same SARIF
structure (`security-severity`, `uriBaseId`, rules with tags).

`normalized/` holds the Pharos Run JSON each one produces.

---

`sarif-sdk-suppressions.sarif`, from the SARIF Standard SDK .NET:

> Copyright (c) Microsoft Corporation. All rights reserved.
>
> MIT License
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to
> deal in the Software without restriction, including without limitation the
> rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
> sell copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in
> all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.
