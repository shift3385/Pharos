import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Bell, Bug, CircleCheck, Eye, Flag, RefreshCw, Undo2, Users, type LucideIcon } from "lucide-react";
import { SegmentedControl } from "@shared/ui/SegmentedControl";
import { groupByDay, isPrimary, targetOf } from "../model/group";
import type { AppNotification } from "../model/types";
import { useNotifications } from "../state/notificationsContext";
import "./NotificationsPanel.css";

type Filter = "all" | "unread";

const ICONS: Record<string, { icon: LucideIcon; tone: string }> = {
  "invitation.received": { icon: Users, tone: "info" },
  "case.review_requested": { icon: Eye, tone: "warning" },
  "case.approved": { icon: CircleCheck, tone: "success" },
  "case.changes_requested": { icon: Undo2, tone: "warning" },
  "defect.assigned": { icon: Bug, tone: "error" },
  "cycle.closed": { icon: Flag, tone: "neutral" },
  "sync.conflict": { icon: RefreshCw, tone: "warning" },
};

/** «hace 5 min», «11:02», as the day group already says which day. */
function timeOf(n: AppNotification, lng: string, now: Date): string {
  const at = new Date(n.createdAt);
  const minutes = Math.round((now.getTime() - at.getTime()) / 60_000);
  if (minutes >= 0 && minutes < 60) {
    return new Intl.RelativeTimeFormat(lng, { numeric: "auto" }).format(-minutes, "minute");
  }
  return at.toLocaleTimeString(lng, { hour: "2-digit", minute: "2-digit" });
}

/**
 * The notifications panel (RED-W2): by day, «Sin leer» as a filter, one
 * direct action per row and «Marcar todo como leído». Opening a row, or its
 * action, marks it read. Lives in the bell's popover (tablet and desktop) or
 * bottom sheet (mobile); `onDone` closes it.
 */
export function NotificationsPanel({ onDone, showTitle = true }: { onDone: () => void; showTitle?: boolean }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const ctx = useNotifications();
  const [filter, setFilter] = useState<Filter>("all");
  const items = ctx?.items ?? [];
  const unread = ctx?.unread ?? 0;
  const lng = i18n.resolvedLanguage ?? "es";
  const now = new Date();
  const shown = filter === "unread" ? items.filter((n) => !n.readAt) : items;
  const groups = groupByDay(shown, now);

  const dayLabel = (id: string, day: Date) =>
    id === "today"
      ? t("notifications.today")
      : id === "yesterday"
        ? t("notifications.yesterday")
        : day.toLocaleDateString(lng, { weekday: "long", day: "numeric", month: "short" });

  const open = (n: AppNotification) => {
    if (!n.readAt) ctx?.markRead([n.id]);
    const target = targetOf(n);
    if (!target) return;
    onDone();
    if (target.kind === "conflicts") ctx?.openConflicts();
    else void navigate(target.path);
  };

  return (
    <div className="np" data-testid="notifications-panel">
      <div className="np__head">
        {showTitle && <h2 className="np__title">{t("notifications.title")}</h2>}
        <button
          type="button"
          className="np__link"
          onClick={() => ctx?.markAllRead()}
          disabled={unread === 0}
          title={unread === 0 ? t("notifications.allReadHint") : undefined}
          data-testid="notifications-mark-all"
        >
          {t("notifications.markAll")}
        </button>
      </div>
      <SegmentedControl<Filter>
        label={t("notifications.filter")}
        size="sm"
        className="np__filter"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: t("notifications.all") },
          { value: "unread", label: unread ? t("notifications.unreadN", { count: unread }) : t("notifications.unread") },
        ]}
        testId="notifications-filter"
      />
      {groups.length === 0 ? (
        <div className="np__empty" data-testid="notifications-empty">
          <span className="np__empty-icon" aria-hidden="true">
            <Bell size={22} />
          </span>
          <p className="np__empty-title">
            {filter === "unread" && items.length ? t("notifications.noUnread") : t("notifications.emptyTitle")}
          </p>
          <p className="np__empty-text">{t("notifications.emptyText")}</p>
        </div>
      ) : (
        <div className="np__list">
          {groups.map((g) => (
            <section key={g.id} className="np__day" aria-label={dayLabel(g.id, g.day)}>
              <h3 className="np__day-title">{dayLabel(g.id, g.day)}</h3>
              <ul className="np__items">
                {g.items.map((n) => (
                  <Row key={n.id} n={n} time={timeOf(n, lng, now)} onOpen={open} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <p className="np__foot">{t("notifications.kept")}</p>
    </div>
  );
}

function Row({ n, time, onOpen }: { n: AppNotification; time: string; onOpen: (n: AppNotification) => void }) {
  const { t } = useTranslation();
  const look = ICONS[n.kind] ?? { icon: Bell, tone: "neutral" };
  const Icon = look.icon;
  const target = targetOf(n);
  const unread = !n.readAt;
  const count = typeof n.data?.count === "number" ? n.data.count : 1;
  const text = t(`notifications.kind.${n.kind}`, {
    actor: n.actorName || t("notifications.someone"),
    key: n.subject.key ?? "",
    title: n.subject.title,
    count,
    defaultValue: n.subject.title,
  });
  return (
    <li className={unread ? "np-row np-row--unread" : "np-row"} data-testid="notification-row" data-kind={n.kind}>
      <span className={`np-row__icon np-row__icon--${look.tone}`} aria-hidden="true">
        <Icon size={16} />
      </span>
      <button type="button" className="np-row__body" onClick={() => onOpen(n)}>
        <span className="np-row__text">{text}</span>
        <span className="np-row__meta">
          {unread && <span className="sr-only">{t("notifications.unreadMark")}</span>}
          {time}
        </span>
      </button>
      <span className="np-row__side">
        {unread && <span className="np-row__dot" aria-hidden="true" />}
        {target && (
          <button
            type="button"
            className={isPrimary(n.kind) ? "np-row__action np-row__action--primary" : "np-row__action"}
            onClick={() => onOpen(n)}
          >
            {t(target.label)}
          </button>
        )}
      </span>
    </li>
  );
}
