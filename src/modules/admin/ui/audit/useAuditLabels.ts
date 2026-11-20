import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { personName, useAuth } from "@modules/auth";
import { useWorkspace } from "@modules/workspaces";
import {
  deviceKind,
  fieldKey,
  memberNames,
  parseActor,
  reviewEvent,
  shortId,
  type AuditChain,
  type AuditRow,
} from "../../model/audit";

/** The translated names Administración › Auditoría shows for raw values:
 *  actors, actions, element types, fields, devices and chain breaks. Unknown
 *  values (a newer device's action, a custom field) show as they are. */
export function useAuditLabels(thisDevice: string) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { workspaces } = useWorkspace();
  return useMemo(() => {
    // The other members by name, as «Miembros» shows them (FIX-41).
    const names = memberNames(workspaces, personName);
    const actor = (raw: string) => {
      const { kind, id } = parseActor(raw);
      if (kind === "user") {
        if (!id) return t("admin.audit.actor.signedOut");
        if (user && id === user.id) return personName(user) || t("admin.audit.actor.you");
        return names.get(id) ?? t("admin.audit.actor.user", { id: shortId(id) });
      }
      if (kind === "agent") return t("admin.audit.actor.agent", { id });
      if (kind === "ci") return t("admin.audit.actor.ci", { id });
      if (kind === "system")
        return t("admin.audit.actor.system", {
          component: t(`admin.audit.components.${id}`, { defaultValue: id }),
        });
      return raw;
    };
    const isMe = (raw: string) => user != null && raw === `user:${user.id}`;
    const action = (a: string) => t(`admin.audit.actions.${a}`, { defaultValue: a });
    /** What an event did: a step of the review flow by its name («Enviado
     *  a revisión», «Cambios pedidos», «Aprobado»), else its action. */
    const eventKey = (row: Pick<AuditRow, "action" | "changes">) => {
      const review = reviewEvent(row);
      return review ? `review.${review}` : row.action;
    };
    const event = (row: Pick<AuditRow, "action" | "changes">) => {
      const review = reviewEvent(row);
      return review ? t(`admin.audit.reviewEvents.${review}`) : action(row.action);
    };
    const entity = (e: string) => t(`admin.audit.entities.${e}`, { defaultValue: e });
    const field = (f: string) => t(`admin.audit.fields.${fieldKey(f)}`, { defaultValue: fieldKey(f) });
    const device = (id: string) => {
      const kind = deviceKind(id, thisDevice);
      return kind === "other" ? t("admin.audit.device.other", { id: shortId(id) }) : t(`admin.audit.device.${kind}`);
    };
    const chainBreak = (c: AuditChain) =>
      c.broken
        ? t(`admin.audit.integrity.break.${c.broken.kind}`, { seq: c.broken.seq, expected: c.broken.expected ?? "" })
        : t("admin.audit.integrity.chainOk");
    // A summary value: a known code (`password_changed`, `merged`, `true`)
    // in words, anything else (a count, a file name) as it is.
    const summaryValue = (v: unknown) => {
      const text = String(v);
      return /^[a-z_]+$/.test(text) ? t(`admin.audit.summaryValue.${text}`, { defaultValue: text }) : text;
    };
    return { actor, isMe, action, event, eventKey, entity, field, device, chainBreak, summaryValue };
  }, [t, user, thisDevice, workspaces]);
}

export type AuditLabels = ReturnType<typeof useAuditLabels>;
