import { useId, type ReactNode } from "react";

/** A settings card of Administración (ScrAdministracion): title, a line on
 *  what it covers, and its rows. */
export function SettingsSection({
  title,
  desc,
  testId,
  children,
}: {
  title: string;
  desc?: string;
  testId?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="adm-card" aria-labelledby={`${id}-title`} data-testid={testId}>
      <header className="adm-card__head">
        <div className="adm-card__titles">
          <h2 id={`${id}-title`} className="t-card-title">
            {title}
          </h2>
          {desc && <p className="adm-hint">{desc}</p>}
        </div>
      </header>
      <div className="adm-rows">{children}</div>
    </section>
  );
}

/** One setting: label and help on the left, the control on the right; they
 *  stack when the card is narrow (container query). `htmlFor` labels a single
 *  control; otherwise the label names the control group (`labelId`). */
export function SettingsRow({
  label,
  hint,
  htmlFor,
  labelId,
  hintId,
  children,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  labelId?: string;
  hintId?: string;
  children: ReactNode;
}) {
  return (
    <div className="adm-row">
      <div className="adm-row__text">
        {htmlFor ? (
          <label htmlFor={htmlFor} id={labelId} className="adm-label">
            {label}
          </label>
        ) : (
          <span id={labelId} className="adm-label">
            {label}
          </span>
        )}
        {hint && (
          <span id={hintId} className="adm-hint">
            {hint}
          </span>
        )}
      </div>
      <div className="adm-row__control">{children}</div>
    </div>
  );
}
