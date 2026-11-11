import { useTranslation } from "react-i18next";
import type { RequirementSource } from "../model/types";
import type { MaterialItem } from "../fromDesign/material";
import { defaultSourceLabel } from "./sourceLabel";

/** A source of «Requisitos desde diseños» (IA-18) in the common review: the
 *  image it comes from, with the region the model pointed at, and its name.
 *  The image lives only in this dialog: Pharos never stores it. */
export function DesignSourceLabel({ source, sent }: { source: RequirementSource; sent: MaterialItem[] }) {
  const { t } = useTranslation();
  const text = defaultSourceLabel(source, t);
  const item = source.kind === "image" ? sent[source.index - 1] : undefined;
  const image = item?.kind === "image" && item.attachment ? item.attachment : undefined;
  if (source.kind !== "image" || !image) {
    return (
      <span>
        {text}
        {source.kind === "image" && source.page ? ` · ${t("traceability.fromDesign.page", { page: source.page })}` : ""}
      </span>
    );
  }
  const r = source.region;
  return (
    <span className="tr-design__source">
      <span className="tr-design__shot" aria-hidden="true">
        <img src={`data:${image.mediaType};base64,${image.data}`} alt="" />
        {r && (
          <span
            className="tr-design__region"
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
          />
        )}
      </span>
      <span>
        {text}
        {r ? ` · ${t("traceability.fromDesign.region")}` : ""}
      </span>
    </span>
  );
}
