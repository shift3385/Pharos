import { createContext, useContext, useState, type ReactNode } from "react";
import { RouterProvider, createMemoryRouter } from "react-router";
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
    createMemoryRouter([{ path: "*", element: <RenderedUi /> }], { initialEntries: [route] }),
  );
  return (
    <Ui.Provider value={children}>
      <RouterProvider router={router} />
    </Ui.Provider>
  );
}
