// One uploaded report, read in a child process so the API can stop it at its
// deadline (`reportParse.ts::processParser`). It answers once and exits.
import { inProcessParser, reasonOf, type ReportInput } from "./reportParse.js";

process.once("message", (input) => {
  inProcessParser(typeof input === "string" ? input : (input as ReportInput)).then(
    (value) => process.send?.({ ok: true, value }, () => process.exit(0)),
    (e: unknown) => process.send?.({ ok: false, reason: reasonOf(e) }, () => process.exit(0)),
  );
});
