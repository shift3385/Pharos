# TRX samples (ING-07)

TRX (VSTest) files from [dorny/test-reporter](https://github.com/dorny/test-reporter)
at commit `79b4b4400dc2`, `__tests__/fixtures/`, downloaded on 2026-11-19
(Git blob hashes checked against GitHub). The author's machine name, user
and workspace path were rewritten to `BUILD-PC`, `ci` and
`C:\src\test-reporter\`; nothing else was edited.

| File                 | Origin                                                                                                     | Licence                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `dotnet-trx.trx`     | xUnit 2 through the VSTest adapter (.NET Core 3.1): passed, failed, `Error`, `NotExecuted`, theories with custom names. | MIT, © Michal Dorner and contributors |
| `dotnet-xunitv3.trx` | xUnit v3 (2025): failures, a class cleanup failure reported as its own result, Unix stack paths.           | MIT, © Michal Dorner and contributors |

Data rows (`InnerResults`), `[TestCategory]` and retries are not in these
samples; `trx.test.ts` covers them with a small MSTest-shaped document.

`normalized/` holds the Pharos Run JSON each one produces.

---

From dorny/test-reporter:

>
> The MIT License (MIT)
>
> Copyright (c) 2021 Michal Dorner and contributors
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
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
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
> THE SOFTWARE.
