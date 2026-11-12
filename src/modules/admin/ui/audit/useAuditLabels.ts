import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@modules/auth";
import { deviceKind, parseActor, shortId, type AuditChain } from "../../model/audit";

/** The translated names Administración › Auditoría shows for raw values:
 *  actors, actions, element types, fields, devices and chain breaks. Unknown
 *  values (a newer device's action, a custom field) show as they are. */
export function useAuditLabels(thisDevice: string) {
  const { t } = useTranslation();
  const { user } = useAuth();
  return useMemo(() => {
    const actor = (raw: string) => {
      const { kind, id } = parseActor(raw);
      if (kind === "user") {
        if (!id) return t("admin.audit.actor.signedOut");
        if (user && id === user.id) return user.displayName || t("admin.audit.actor.you");
        return t("admin.audit.actor.user", { id: shortId(id) });
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
    const entity = (e: string) => t(`admin.audit.entities.${e}`, { defaultValue: e });
    const field = (f: string) => t(`admin.audit.fields.${f}`, { defaultValue: f });
    const device = (id: string) => {
      const kind = deviceKind(id, thisDevice);
      return kind === "other" ? t("admin.audit.device.other", { id: shortId(id) }) : t(`admin.audit.device.${kind}`);
    };
    const chainBreak = (c: AuditChain) =>
      c.broken
        ? t(`admin.audit.integrity.break.${c.broken.kind}`, { seq: c.broken.seq, expected: c.broken.expected ?? "" })
        : t("admin.audit.integrity.chainOk");
    return { actor, isMe, action, entity, field, device, chainBreak };
  }, [t, user, thisDevice]);
}

export type AuditLabels = ReturnType<typeof useAuditLabels>;
