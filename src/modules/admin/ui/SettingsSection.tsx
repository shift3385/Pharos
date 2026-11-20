import { useId, type ReactNode } from "react";
import { InfoTip } from "@shared/ui/InfoTip";

/** A settings card of Administración (ScrAdministracion): its title, with
 *  what it covers behind «?» (FIX-46: a standing paragraph opened every
 *  card), and its rows. */
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
    <section
      className="adm-card"
      aria-labelledby={`${id}-title`}
      aria-describedby={desc ? `${id}-desc` : undefined}
      data-testid={testId}
    >
      <header className="adm-card__head">
        <div className="adm-card__titles ui-title-row">
          <h2 id={`${id}-title`} className="t-card-title">
            {title}
          </h2>
          {desc && (
            <InfoTip id={`${id}-desc`} label={title}>
              {desc}
            </InfoTip>
          )}
        </div>
      </header>
      <div className="adm-rows">{children}</div>
    </section>
  );
}

/** One setting: its label, with its help behind «?», on the left, the
 *  control on the right; they stack when the card is narrow (container
 *  query). `htmlFor` labels a single control; otherwise the label names the
 *  control group (`labelId`). The help is long and secondary, so it lives
 *  behind «?» (FIX-46), still under `hintId` for the control's
 *  `aria-describedby`; a short state that must stay in view («Ahora: 45
 *  días») passes `hintInline`. */
export function SettingsRow({
  label,
  hint,
  hintInline = false,
  htmlFor,
  labelId,
  hintId,
  children,
}: {
  label: string;
  hint?: ReactNode;
  hintInline?: boolean;
  htmlFor?: string;
  labelId?: string;
  hintId?: string;
  children: ReactNode;
}) {
  const ownId = useId();
  const helpId = hintId ?? `${ownId}-hint`;
  return (
    <div className="adm-row">
      <div className="adm-row__text">
        <span className="ui-title-row">
          {htmlFor ? (
            <label htmlFor={htmlFor} id={labelId} className="adm-label">
              {label}
            </label>
          ) : (
            <span id={labelId} className="adm-label">
              {label}
            </span>
          )}
          {hint && !hintInline && (
            <InfoTip id={helpId} label={label}>
              {hint}
            </InfoTip>
          )}
        </span>
        {hint && hintInline && (
          <span id={helpId} className="adm-hint">
            {hint}
          </span>
        )}
      </div>
      <div className="adm-row__control">{children}</div>
    </div>
  );
}
