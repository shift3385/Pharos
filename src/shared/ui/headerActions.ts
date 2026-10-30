import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import "./headerActions.css";

interface HeaderActionsSlot {
  /** Shows `node` for the registrant `token`. */
  set: (token: object, node: ReactNode) => void;
  /** Clears the actions only if `token` is still the one shown. */
  clear: (token: object) => void;
}

/** Set by the page header that shows the actions (`ProjectHeaderLayout` in
 *  @modules/projects); null outside one. It lives in shared/ui so the section
 *  modules (test-plan, test-cases, planner, traceability) can use it without
 *  importing projects, which composes them (the module graph stays acyclic). */
export const HeaderActionsContext = createContext<HeaderActionsSlot | null>(
  null,
);

/** State for the header that renders the actions: `actions` to draw and
 *  `slot` for `HeaderActionsContext`. The last registrant wins; a registrant
 *  that unmounts clears only its own actions, so when section A gives way to
 *  section B, A's cleanup never wipes what B has just set. */
export function useHeaderActionsSlot() {
  const [current, setCurrent] = useState<{
    token: object;
    node: ReactNode;
  } | null>(null);
  const [slot] = useState<HeaderActionsSlot>(() => ({
    set: (token, node) => setCurrent({ token, node }),
    clear: (token) => setCurrent((c) => (c?.token === token ? null : c)),
  }));
  return { actions: current?.node ?? null, slot };
}

/**
 * Puts buttons on the right of the project header (e.g. the plan's
 * «Revisiones» and «Importar / Exportar»). Call it from a project section's
 * page; the header shows the latest node and drops it when the page unmounts.
 * Outside a project page (tests of the section alone) it does nothing.
 *
 * Cost: every render of the calling page hands over a new node, so the header
 * re-renders after each of them (the page itself does not render again: it is
 * the provider's `children`). Keep the node small. Never call it from inside
 * the header itself: setting the header's state from its own render loops.
 */
export function useHeaderActions(node: ReactNode) {
  const slot = useContext(HeaderActionsContext);
  // This registrant's identity, stable for its lifetime.
  const token = useRef({}).current;
  // Every render hands over the current node (its callbacks are this
  // render's).
  useLayoutEffect(() => {
    slot?.set(token, node);
  });
  useLayoutEffect(() => () => slot?.clear(token), [slot, token]);
}
