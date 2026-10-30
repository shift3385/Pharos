import type { ReactNode } from "react";
import { HeaderActionsContext, useHeaderActionsSlot } from "@shared/ui/headerActions";

/** Tests only: shows what a page puts in the project header (the real header
 *  lives in projects, which test-plan cannot import). */
export function WithHeader({ children }: { children: ReactNode }) {
  const { actions, slot } = useHeaderActionsSlot();
  return (
    <HeaderActionsContext.Provider value={slot}>
      <div data-testid="header-actions">{actions}</div>
      {children}
    </HeaderActionsContext.Provider>
  );
}
