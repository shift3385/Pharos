// Public API of the notifications module (RED-W2, ADR-0048).
export { NotificationsProvider } from "./state/NotificationsProvider";
export { useNotifications, type NotificationsValue } from "./state/notificationsContext";
export { NotificationsPanel } from "./ui/NotificationsPanel";
export {
  notify,
  pullNotifications,
  markNotificationsRead,
  NOTIFICATIONS_CHANGED,
} from "./api/notificationsApi";
export { badgeText } from "./model/group";
export { CASE_REVIEW_EVENT, type CaseReviewEvent } from "./model/caseReview";
export type {
  AppNotification,
  NotificationKind,
  NotificationSubject,
  NotifyInput,
  Recipients,
  TravellingKind,
} from "./model/types";
