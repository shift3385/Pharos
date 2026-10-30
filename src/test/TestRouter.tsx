import { createContext, useContext, useState, type ReactNode } from "react";
// `RouterProvider` from "react-router" (not "react-router/dom" as in
// main.tsx): under Vitest the "/dom" entry loads a second copy of the router
// whose contexts the hooks do not see.
import { RouterProvider, createMemoryRouter } from "react-router";
import { RethrowRouteError } from "@shared/ui/RethrowRouteError";
import { ViewportProvider } from "@shared/ui/ViewportProvider";

// The rendered UI reaches the router's only route through this context, so a
// `rerender` with new UI updates it without creating another router.
const Ui = createContext<ReactNode>(null);
function RenderedUi() {
  return <ViewportProvider>{useContext(Ui)}</ViewportProvider>;
}

/** A data memory router like the app's (`createHashRouter`, RED-V3k): one
 *  splat route that renders `children`, so `useBlocker` works in tests. */
export function TestRouter({ route, children }: { route: string; children: ReactNode }) {
  const [router] = useState(() =>
    createMemoryRouter([{ path: "*", element: <RenderedUi />, ErrorBoundary: RethrowRouteError }], {
      initialEntries: [route],
    }),
  );
  return (
    <Ui.Provider value={children}>
      <RouterProvider router={router} />
    </Ui.Provider>
  );
}
