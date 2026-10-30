import { useRouteError } from "react-router";

/**
 * Error element of the app's only route: it rethrows, so a crash in the shell
 * (AppShell, Sidebar, Topbar, sign-in, splash, DbErrorScreen, the viewport)
 * reaches our `ErrorBoundary variant="app"` around the router, which logs it
 * (BASE-08) and offers «Exportar diagnóstico», instead of React Router's
 * default English «Unexpected Application Error!» screen.
 */
export function RethrowRouteError(): never {
  throw useRouteError();
}
