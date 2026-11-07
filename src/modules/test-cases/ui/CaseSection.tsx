import type { ReactNode } from "react";

/** One block of the case form (UX-19): a dividing line above it, then its title
 *  with the AI button and mark beside it. What the AI proposes opens right under
 *  the title. With `labelFor`, the title is the label of that one control. */
export function CaseSection({
  title,
  labelFor,
  assist,
  joined,
  children,
}: {
  title: string;
  labelFor?: string;
  assist?: ReactNode;
  /** Belongs with the block before it: no line between them. */
  joined?: boolean;
  children: ReactNode;
}) {
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
        {assist}
      </div>
      {labelFor ? <div className="tp-field">{children}</div> : children}
    </div>
  );
}
