import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerInfo } from "@modules/server-picker";
import { Alert } from "@shared/ui/Alert";
import { Dialog } from "@shared/ui/Dialog";
import { FormField } from "@shared/ui/FormField";
import { Select } from "@shared/ui/Select";
import { useToast } from "@shared/ui/Toast";
import { required } from "@shared/validation";
import {
  API_SCOPES,
  CI_SCOPES,
  DEFAULT_EXPIRY_DAYS,
  EXPIRY_DAYS,
  expiryIn,
  type ApiScope,
  type ExpiryDays,
  type IssuedToken,
} from "../api/tokensApi";
import { tokenFailure } from "./failure";
import "@shared/ui/ConfirmDialog.css";
import "./integrations.css";

/** Where a new token is bound: a project of the workspace (project token) or
 *  a workspace of the person, or all of them (personal token). */
export interface TokenTarget {
  id: string;
  name: string;
}

/** «Nuevo token» (INT-02, boceto 2): name, project or workspace, permissions
 *  and expiry. `create` does the request; the dialog shows its errors. */
export function NewTokenDialog({
  kind,
  workspaceName,
  targets,
  allTargetsLabel,
  create,
  onCreated,
  onCancel,
}: {
  kind: "project" | "personal";
  /** The workspace of a project token, for the note on whose permissions it uses. */
  workspaceName?: string;
  targets: TokenTarget[];
  /** Personal token: the label of «every workspace» (value ""). */
  allTargetsLabel?: string;
  create: (input: { name: string; target: string | null; scopes: ApiScope[]; expiresAt: string }) => Promise<IssuedToken>;
  onCreated: (issued: IssuedToken) => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const id = useId();
  const [name, setName] = useState("");
  const [target, setTarget] = useState(kind === "project" ? (targets[0]?.id ?? "") : "");
  const [scopes, setScopes] = useState<ApiScope[]>(CI_SCOPES);
  const [days, setDays] = useState<ExpiryDays>(DEFAULT_EXPIRY_DAYS);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const nameIssue = tried ? required(name) : null;
  const scopeMissing = tried && scopes.length === 0;
  const date = (d: number) => new Date(expiryIn(d)).toLocaleDateString(i18n.language, { dateStyle: "medium" });

  function toggle(scope: ApiScope, on: boolean) {
    setScopes((s) => API_SCOPES.filter((x) => (x === scope ? on : s.includes(x))));
  }

  async function submit() {
    setTried(true);
    if (!name.trim() || scopes.length === 0 || (kind === "project" && !target)) return;
    setBusy(true);
    try {
      onCreated(await create({ name: name.trim(), target: target || null, scopes, expiresAt: expiryIn(days) }));
    } catch (e) {
      toast(tokenFailure(t, e), "error");
      setBusy(false);
    }
  }

  return (
    <Dialog labelledBy={`${id}-title`} onClose={onCancel} dismissable={!busy}>
      <h3 id={`${id}-title`} className="cd__title">
        {t(kind === "project" ? "integrations.tokens.newProjectTitle" : "integrations.tokens.newPersonalTitle")}
      </h3>
      <FormField label={t("integrations.tokens.name")} hint={t("integrations.tokens.nameHint")} issue={nameIssue} required>
        {(p) => (
          <input {...p} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} data-testid="token-name" />
        )}
      </FormField>
      <FormField label={t(kind === "project" ? "integrations.tokens.project" : "integrations.tokens.workspaces")}>
        {(p) => (
          <Select<string>
            id={p.id}
            value={target}
            onChange={setTarget}
            options={[
              ...(kind === "personal" ? [{ value: "", label: allTargetsLabel ?? "" }] : []),
              ...targets.map((x) => ({ value: x.id, label: x.name })),
            ]}
            data-testid="token-target"
          />
        )}
      </FormField>
      <fieldset className="int-scopes">
        <legend>{t("integrations.tokens.scopes")}</legend>
        {API_SCOPES.map((s) => (
          <label key={s} className="int-scope">
            <input
              type="checkbox"
              checked={scopes.includes(s)}
              onChange={(e) => toggle(s, e.target.checked)}
              data-testid={`token-scope-${s}`}
            />
            <span>{t(`integrations.scopes.${s.replace(":", "_")}`)}</span>
            <code className="int-chip">{s}</code>
          </label>
        ))}
        <p className="tp__muted">{t("integrations.tokens.scopesHint")}</p>
        {scopeMissing && (
          <p className="int-issue" role="alert">
            {t("integrations.tokens.scopeRequired")}
          </p>
        )}
      </fieldset>
      <FormField label={t("integrations.tokens.expires")} hint={t("integrations.tokens.expiresHint")}>
        {(p) => (
          <Select<string>
            id={p.id}
            aria-describedby={p["aria-describedby"]}
            value={String(days)}
            onChange={(v) => setDays(Number(v) as ExpiryDays)}
            options={EXPIRY_DAYS.map((d) => ({ value: String(d), label: t("integrations.tokens.inDays", { count: d, date: date(d) }) }))}
          />
        )}
      </FormField>
      <Alert kind="info">
        {kind === "project"
          ? t("integrations.tokens.actsAsYouProject", { workspace: workspaceName ?? "" })
          : t("integrations.tokens.actsAsYouPersonal")}
      </Alert>
      <div className="cd__actions">
        <button type="button" className="cd__cancel" onClick={onCancel} disabled={busy}>
          {t("common.cancel")}
        </button>
        <button type="button" className="cd__confirm" onClick={() => void submit()} disabled={busy} data-testid="token-create">
          {t("integrations.tokens.create")}
        </button>
      </div>
    </Dialog>
  );
}

/** «Token creado» (boceto 3): the secret, once. It closes only after the
 *  person says they saved it, so it is not lost by a stray Escape. */
export function TokenCreatedDialog({ issued, onDone }: { issued: IssuedToken; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const id = useId();
  const { info } = useServerInfo();
  const [saved, setSaved] = useState(false);
  const project = issued.view.kind === "project";
  const example = project
    ? t("integrations.tokens.ciExample", { url: info.origin })
    : t("integrations.tokens.cliExample", { url: info.origin });

  async function copy() {
    try {
      await navigator.clipboard.writeText(issued.token);
      toast(t("integrations.tokens.copied"), "success");
    } catch {
      const el = document.getElementById(`${id}-secret`);
      el?.focus();
      if (el) window.getSelection()?.selectAllChildren(el);
    }
  }

  return (
    <Dialog labelledBy={`${id}-title`} describedBy={`${id}-once`} dismissable={false}>
      <h3 id={`${id}-title`} className="cd__title">
        {t("integrations.tokens.createdTitle")}
      </h3>
      <Alert kind="warning">
        <span id={`${id}-once`}>{t("integrations.tokens.createdOnce")}</span>
      </Alert>
      <div className="int-secret">
        <code id={`${id}-secret`} tabIndex={-1} aria-label={t("integrations.tokens.secretLabel")} data-testid="token-secret">
          {issued.token}
        </code>
        <button type="button" className="ui-btn ui-btn--small" onClick={() => void copy()} data-testid="token-copy">
          {t("integrations.tokens.copy")}
        </button>
      </div>
      <p className="int-subtitle">{t(project ? "integrations.tokens.ciTitle" : "integrations.tokens.cliTitle")}</p>
      <pre className="int-snippet">{example}</pre>
      <label className="int-scope">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} data-testid="token-saved" />
        <span>{t("integrations.tokens.saved")}</span>
      </label>
      <div className="cd__actions">
        <button type="button" className="cd__confirm" onClick={onDone} disabled={!saved} data-testid="token-done">
          {t("integrations.tokens.done")}
        </button>
      </div>
    </Dialog>
  );
}

/** «Rotar» (ADR-0052 §3): a new secret now; the old one stops now, or keeps
 *  working 24 hours so CI can switch. */
export function RotateTokenDialog({
  name,
  rotate,
  onRotated,
  onCancel,
}: {
  name: string;
  rotate: (overlapHours: 0 | 24) => Promise<IssuedToken>;
  onRotated: (issued: IssuedToken) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const id = useId();
  const [busy, setBusy] = useState(false);

  async function go(overlap: 0 | 24) {
    setBusy(true);
    try {
      onRotated(await rotate(overlap));
    } catch (e) {
      toast(tokenFailure(t, e), "error");
      setBusy(false);
    }
  }

  return (
    <Dialog labelledBy={`${id}-title`} describedBy={`${id}-msg`} onClose={onCancel} dismissable={!busy}>
      <h3 id={`${id}-title`} className="cd__title">
        {t("integrations.tokens.rotateTitle", { name })}
      </h3>
      <p id={`${id}-msg`} className="cd__msg">
        {t("integrations.tokens.rotateBody")}
      </p>
      <div className="cd__actions">
        <button type="button" className="cd__cancel" onClick={onCancel} disabled={busy}>
          {t("common.cancel")}
        </button>
        <button type="button" className="ui-btn" onClick={() => void go(24)} disabled={busy} data-testid="token-rotate-overlap">
          {t("integrations.tokens.rotateOverlap")}
        </button>
        <button type="button" className="cd__confirm" onClick={() => void go(0)} disabled={busy} data-testid="token-rotate-now">
          {t("integrations.tokens.rotateNow")}
        </button>
      </div>
    </Dialog>
  );
}
