// One uploaded report, read in a child process so the API can stop it at its
// deadline (`reportParse.ts::processParser`). It answers once and exits.
import { inProcessParser, reasonOf } from "./reportParse";

process.once("message", (text) => {
  inProcessParser(String(text)).then(
    (value) => process.send?.({ ok: true, value }, () => process.exit(0)),
    (e: unknown) => process.send?.({ ok: false, reason: reasonOf(e) }, () => process.exit(0)),
  );
});
