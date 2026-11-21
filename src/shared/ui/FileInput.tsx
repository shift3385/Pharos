import { useRef, useState, type InputHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { Upload } from "lucide-react";
import "./buttons.css";
import "./fileInput.css";

/**
 * A file field drawn as a Pharos button («Elegir archivo…») and the chosen
 * name, instead of the browser's «Elegir archivo / Ningún archivo» (FIX-36).
 *
 * The native input is still the control: it keeps the field's label, takes the
 * keyboard focus (Enter or Space opens the picker) and receives uploads in
 * tests. It is only visually hidden; the button beside it is for the pointer
 * and stays out of the tab order and the accessibility tree.
 */
export function FileInput({
  folder = false,
  onChange,
  ...input
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Pick a whole folder (`webkitdirectory`). */
  folder?: boolean;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const summary =
    chosen.length === 0
      ? t(folder ? "common.noFolderChosen" : "common.noFileChosen")
      : chosen.length === 1
        ? chosen[0]
        : t("common.filesChosen", { count: chosen.length });
  return (
    <span className="ui-file" data-disabled={input.disabled || undefined}>
      <input
        {...input}
        {...(folder ? { webkitdirectory: "", multiple: true } : {})}
        ref={ref}
        type="file"
        className="ui-file__input"
        onChange={(e) => {
          setChosen(Array.from(e.target.files ?? []).map((f) => f.name));
          onChange?.(e);
        }}
      />
      <button
        type="button"
        className="ui-btn ui-btn--small ui-file__btn"
        tabIndex={-1}
        aria-hidden="true"
        disabled={input.disabled}
        onClick={() => ref.current?.click()}
      >
        <Upload size={15} aria-hidden="true" />
        {t(folder ? "common.chooseFolder" : "common.chooseFile")}
      </button>
      <span className="ui-file__name" title={chosen.join(", ") || undefined}>
        {summary}
      </span>
    </span>
  );
}
