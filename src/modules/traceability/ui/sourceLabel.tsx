import type { ReactNode } from "react";
import type { TFunction } from "i18next";
import { fileSourceLabel } from "../proposals/fromProject";
import type { RequirementSource } from "../model/types";

/** A source as text: «docs/spec.md:12-20», «Imagen 2 · login.png», a frame. */
export function defaultSourceLabel(
  s: RequirementSource,
  t: TFunction,
): ReactNode {
  if (s.kind === "file")
    return <code>{fileSourceLabel(s.path, s.startLine, s.endLine)}</code>;
  if (s.kind === "image")
    return t("traceability.proposals.sourceImage", {
      index: s.index,
      name: s.name,
    });
  return s.frame ? `${s.name} · ${s.frame}` : s.name;
}
