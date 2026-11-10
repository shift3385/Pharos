import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { isTauri } from "@shared/platform";
import { Dialog } from "@shared/ui/Dialog";
import { Logo } from "@shared/ui/Logo";
import { APP_BUILD, APP_VERSION, type StackItem } from "@shared/version";

/** «Acerca de Pharos» (UX-26): version and build, platform, stack, licence,
 *  the project owner and the development assistant. Opened from the name and
 *  logo at the top of the sidebar; the version left the sidebar foot for it. */
export function AboutDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const id = useId();
  const stackName = (item: StackItem) =>
    item.encrypted
      ? t("about.sqliteEncrypted")
      : item.version
        ? `${item.name} ${item.version}`
        : item.name;
  const rows: [string, ReactNode][] = [
    [
      t("about.version"),
      <span className="t-id" data-testid="app-version">
        {APP_VERSION}
      </span>,
    ],
    [
      t("about.build"),
      <span className="t-id" data-testid="app-build">
        {APP_BUILD.commit} · {APP_BUILD.date}
      </span>,
    ],
    [
      t("about.platform"),
      isTauri() ? t("about.platformDesktop") : t("about.platformWeb"),
    ],
    [t("about.stack"), APP_BUILD.stack.map(stackName).join(" · ")],
    [t("about.license"), t("about.licenseValue")],
    [t("about.owner"), t("about.ownerValue")],
    [t("about.assistant"), t("about.assistantValue")],
  ];
  return (
    <Dialog
      labelledBy={`${id}-title`}
      describedBy={`${id}-tagline`}
      onClose={onClose}
      className="cd about"
    >
      <div className="about__head">
        <Logo size={44} decorative />
        <div>
          <h2 id={`${id}-title`} className="cd__title">
            {t("about.title")}
          </h2>
          <p id={`${id}-tagline`} className="cd__msg">
            {t("about.tagline")}
          </p>
        </div>
      </div>
      <dl className="about__list">
        {rows.map(([term, value]) => (
          <div key={term} className="about__row">
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="cd__actions">
        <button
          type="button"
          className="cd__cancel"
          onClick={onClose}
          autoFocus
        >
          {t("about.close")}
        </button>
      </div>
    </Dialog>
  );
}
