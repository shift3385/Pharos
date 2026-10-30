import { useState, type ReactNode } from "react";
import { HeaderActionsContext } from "@shared/ui/headerActions";

/** Tests only: shows what a page puts in the project header (the real header
 *  lives in projects, which test-plan cannot import). */
export function WithHeader({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<ReactNode>(null);
  return (
    <HeaderActionsContext.Provider value={setActions}>
      <div data-testid="header-actions">{actions}</div>
      {children}
    </HeaderActionsContext.Provider>
  );
}
