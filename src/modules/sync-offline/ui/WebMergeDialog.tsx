import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "@shared/ui/Dialog";
import {
  listenForMergeAsks,
  MERGE_ASK_EVENT,
  type MergeAsk,
} from "../web/mergePrompt";
import { FieldMerge } from "./FieldMerge";
import "@shared/ui/ConfirmDialog.css";
import "./ConflictPanel.css";

// Web only (SYNC-02, ADR-0051; boceto 3): someone changed the same fields of
// an item while you edited it. What does not collide is already combined;
// choose what stays in each field, or cancel and keep editing.

export function WebMergeDialog() {
  const { t } = useTranslation();
  const id = useId();
  const [ask, setAsk] = useState<MergeAsk | null>(null);

  useEffect(() => {
    const stop = listenForMergeAsks();
    const onAsk = (e: Event) => setAsk((e as CustomEvent<MergeAsk>).detail);
    window.addEventListener(MERGE_ASK_EVENT, onAsk);
    return () => {
      stop();
      window.removeEventListener(MERGE_ASK_EVENT, onAsk);
    };
  }, []);

  if (!ask) return null;
  const close = (choices: Parameters<MergeAsk["answer"]>[0]) => {
    ask.answer(choices);
    setAsk(null);
  };
  return (
    <Dialog
      labelledBy={`${id}-title`}
      describedBy={`${id}-intro`}
      onClose={() => close(null)}
      dismissable
    >
      <h3 id={`${id}-title`} className="cd__title">
        {t("sync.web.mergeTitle")}
      </h3>
      <p id={`${id}-intro`} className="cd__msg">
        {t("sync.web.mergeIntro")}
      </p>
      <FieldMerge
        origins={ask.origins}
        conflicts={ask.conflicts}
        busy={false}
        onApply={(c) => close(c)}
      />
      <div className="cd__actions">
        <button
          type="button"
          className="cd__cancel"
          onClick={() => close(null)}
        >
          {t("sync.web.mergeCancel")}
        </button>
      </div>
    </Dialog>
  );
}
