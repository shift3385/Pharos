import type { HTMLAttributes } from "react";

// Ids shared by `Tabs` and its panels (kept apart from the components so
// fast refresh keeps working).
export const tabId = (id: string, prefix: string) => `${prefix}tab-${id}`;
export const panelId = (id: string, prefix: string) => `${prefix}tabpanel-${id}`;

/** Props for the panel of tab `id` (same `idPrefix` as its `Tabs`). */
export function tabPanelProps(id: string, idPrefix = ""): HTMLAttributes<HTMLElement> {
  return {
    id: panelId(id, idPrefix),
    role: "tabpanel",
    "aria-labelledby": tabId(id, idPrefix),
    tabIndex: 0,
  };
}
