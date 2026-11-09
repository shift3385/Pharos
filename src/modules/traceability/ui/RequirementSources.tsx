import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@modules/auth";
import { Dialog } from "@shared/ui/Dialog";
import {
  requirementAttachments,
  type RequirementAttachment,
} from "../api/requirementAttachments";
import type { RequirementSource } from "../model/types";
import { defaultSourceLabel } from "./sourceLabel";
import "@shared/ui/ConfirmDialog.css";
import "./Traceability.css";

type ImageSource = Extract<RequirementSource, { kind: "image" }>;
type Region = NonNullable<ImageSource["region"]>;

function RegionBox({ region }: { region?: Region }) {
  if (!region) return null;
  return (
    <span
      className="tr-design__region"
      style={{
        left: `${region.x * 100}%`,
        top: `${region.y * 100}%`,
        width: `${region.w * 100}%`,
        height: `${region.h * 100}%`,
      }}
    />
  );
}

/** One image source: its thumbnail with the region the AI pointed at, and the
 *  full image on click, when the image was kept (IA-19); else its name and
 *  why it cannot be shown. */
function ImageSourceItem({
  source,
  attachment,
}: {
  source: ImageSource;
  attachment?: RequirementAttachment;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const titleId = useId();
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const label = defaultSourceLabel(source, t);

  useEffect(() => {
    let live = true;
    if (!attachment || attachment.purged) return;
    requirementAttachments
      .preview(attachment.id, user?.id ?? "")
      .then((u) => live && setUrl(u))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [attachment, user?.id]);

  if (!url) {
    const why = !requirementAttachments.available()
      ? t("traceability.fromDesign.sourceDesktopOnly")
      : attachment?.purged
        ? t("traceability.fromDesign.sourcePurged")
        : t("traceability.fromDesign.sourceNotKept");
    return (
      <li>
        {label}
        <span className="tr-gen__desc">{why}</span>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        className="tr-design__source tr-design__open"
        onClick={() => setOpen(true)}
        aria-label={t("traceability.fromDesign.sourceOpen", {
          name: source.name,
        })}
      >
        <span className="tr-design__shot" aria-hidden="true">
          <img src={url} alt="" />
          <RegionBox region={source.region} />
        </span>
        <span>{label}</span>
      </button>
      {open && (
        <Dialog
          className="cd tr-modal tr-modal--wide tr-design__viewer"
          labelledBy={titleId}
          onClose={() => setOpen(false)}
        >
          <h3 id={titleId} className="cd__title">
            {label}
          </h3>
          <div className="tr-design__full">
            <div className="tr-design__canvas">
              <img src={url} alt={source.name} />
              <RegionBox region={source.region} />
            </div>
          </div>
          <div className="cd__actions">
            <button
              type="button"
              className="cd__confirm"
              onClick={() => setOpen(false)}
            >
              {t("common.close")}
            </button>
          </div>
        </Dialog>
      )}
    </li>
  );
}

/** «Fuente» of a saved requirement (IA-17/18): each source, and for images
 *  the kept image, matched by its name (IA-19). */
export function RequirementSources({
  requirementId,
  sources,
}: {
  requirementId?: string;
  sources: RequirementSource[];
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [kept, setKept] = useState<Map<string, RequirementAttachment>>(
    new Map(),
  );

  useEffect(() => {
    let live = true;
    if (!requirementId || !sources.some((s) => s.kind === "image")) return;
    requirementAttachments
      .list(requirementId, user?.id ?? "")
      .then((list) => live && setKept(new Map(list.map((a) => [a.name, a]))))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [requirementId, sources, user?.id]);

  return (
    <ul className="tr-sources">
      {sources.map((s, i) =>
        s.kind === "image" ? (
          <ImageSourceItem key={i} source={s} attachment={kept.get(s.name)} />
        ) : (
          <li key={i}>{defaultSourceLabel(s, t)}</li>
        ),
      )}
    </ul>
  );
}
