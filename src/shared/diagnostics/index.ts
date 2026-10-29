// Public API of the client diagnostics (BASE-08).
export {
  buildDiagnosticZip,
  describeError,
  diagnosticFileName,
  exportDiagnostics,
  installGlobalErrorHandlers,
  logClientError,
  recentClientErrors,
} from "./diagnostics";
export { redact } from "./redact";
