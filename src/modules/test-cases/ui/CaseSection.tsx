import { useId, type ReactNode } from "react";
import { InfoTip } from "@shared/ui/InfoTip";

/** One block of the case form (UX-19): a dividing line above it, then its title
 *  with the AI button and mark beside it. What the AI proposes opens right under
 *  the title. With `labelFor`, the title is the label of that one control.
 *  With `info`, the block's longer help sits behind a «?» next to the title
 *  instead of taking a line of the form (FIX-35). */
export function CaseSection({
  title,
  labelFor,
  assist,
  info,
  joined,
  children,
}: {
  title: string;
  labelFor?: string;
  assist?: ReactNode;
  /** Secondary help, shown behind a «?» beside the title. */
  info?: ReactNode;
  /** Belongs with the block before it: no line between them. */
  joined?: boolean;
  children: ReactNode;
}) {
  const infoId = useId();
  return (
    <div className={joined ? "tc-section tc-section--joined" : "tc-section"}>
      <div className="tc-section__head">
        {labelFor ? (
          <label className="tc-section__title" htmlFor={labelFor}>
            {title}
          </label>
        ) : (
          <h3 className="tc-section__title">{title}</h3>
        )}
        {info && (
          <InfoTip id={`${infoId}-info`} label={title}>
            {info}
          </InfoTip>
        )}
        {assist}
      </div>
      {labelFor ? <div className="tp-field">{children}</div> : children}
    </div>
  );
}
