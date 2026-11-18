import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  /** A hint under the field, tied to it with `aria-describedby`. */
  help?: string;
  children?: ReactNode;
}

/** A labelled field of the sign-in screens. */
export function Field({ id, label, help, children, ...rest }: FieldProps) {
  const helpId = help ? `${id}-help` : undefined;
  return (
    <div className="auth-field">
      <label className="auth-field__label" htmlFor={id}>
        {label}
      </label>
      <div className="auth-field__box">
        <input
          id={id}
          name={id}
          className="auth-field__input"
          aria-describedby={helpId}
          {...rest}
        />
        {children}
      </div>
      {help && (
        <span id={helpId} className="auth-field__help">
          {help}
        </span>
      )}
    </div>
  );
}

/** A password field with its «Mostrar» toggle. The value is never logged or
 *  kept anywhere but the form's state. */
export function PasswordField(props: Omit<FieldProps, "type" | "children">) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  return (
    <Field {...props} type={shown ? "text" : "password"}>
      <button
        type="button"
        className="auth-field__reveal"
        aria-pressed={shown}
        aria-label={t("auth.showPassword")}
        title={t("auth.showPassword")}
        onClick={() => setShown((s) => !s)}
      >
        {shown ? (
          <EyeOff size={16} aria-hidden="true" />
        ) : (
          <Eye size={16} aria-hidden="true" />
        )}
      </button>
    </Field>
  );
}
