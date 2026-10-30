import {
  createContext,
  useContext,
  useLayoutEffect,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import "./headerActions.css";

/** Set by the page header that shows the actions (`ProjectHeaderLayout` in
 *  @modules/projects); null outside one. It lives in shared/ui so the section
 *  modules (test-plan, test-cases, planner, traceability) can use it without
 *  importing projects, which composes them (the module graph stays acyclic). */
export const HeaderActionsContext = createContext<Dispatch<SetStateAction<ReactNode>> | null>(
  null,
);

/**
 * Puts buttons on the right of the project header (e.g. the plan's
 * «Revisiones» and «Importar / Exportar»). Call it from a project section's
 * page; the header shows the latest node and drops it when the page unmounts.
 * Outside a project page (tests of the section alone) it does nothing.
 */
export function useHeaderActions(node: ReactNode) {
  const set = useContext(HeaderActionsContext);
  // Every render hands over the current node (its callbacks are this
  // render's). Only the header re-renders: the section is `children` of the
  // provider, so updating the provider's state does not render it again.
  useLayoutEffect(() => {
    set?.(node);
  });
  useLayoutEffect(() => () => set?.(null), [set]);
}
