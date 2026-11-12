import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import { useToast } from "@shared/ui/Toast";
import { CloseCycleDialog } from "./CloseCycleDialog";
import "@shared/ui/buttons.css";

/** «Cerrar ciclo…» (DOC-02, D5): the only way to close a cycle, through the
 *  quality gate. The cycle's detail shows it while the cycle is open. */
export function CloseCycleButton({
  projectId,
  cycleId,
  cycleLabel,
  onClosed,
}: {
  projectId: string;
  cycleId: string;
  cycleLabel: string;
  onClosed: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="ui-btn" data-testid="cycle-close" onClick={() => setOpen(true)}>
        <Lock size={16} aria-hidden="true" />
        <span className="ui-btn__text">{t("gate.open")}</span>
      </button>
      {open && (
        <CloseCycleDialog
          projectId={projectId}
          cycleId={cycleId}
          cycleLabel={cycleLabel}
          onClose={() => setOpen(false)}
          onClosed={(closure) => {
            setOpen(false);
            toast(t("gate.closedToast", { verdict: t(`gate.verdict.${closure.verdict}`) }));
            onClosed();
          }}
        />
      )}
    </>
  );
}
