import { useCallback, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "@shared/ui/Alert";
import { Dialog } from "@shared/ui/Dialog";
import { FormField } from "@shared/ui/FormField";
import { InfoTip } from "@shared/ui/InfoTip";
import { Select } from "@shared/ui/Select";
import { useToast } from "@shared/ui/Toast";
import { useConfirm } from "@shared/ui/useConfirm";
import { required } from "@shared/validation";
import { tokensApi, type WorkspaceProject } from "../api/tokensApi";
import {
  DEFAULT_EVENTS,
  WEBHOOK_EVENTS,
  webhooksApi,
  type Delivery,
  type Webhook,
  type WebhookEvent,
  type WebhookInput,
} from "../api/webhooksApi";
import { tokenFailure } from "./failure";
import "@shared/ui/ConfirmDialog.css";
import "./integrations.css";

const eventKey = (e: string) => `integrations.webhooks.events.${e.replace(".", "_")}`;

/** What to say when a webhook request fails. */
function hookFailure(t: (k: string, o?: Record<string, unknown>) => string, e: unknown): string {
  const code = e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
  // The server's extra fields (`reason`) travel in the error's `body`.
  const body = e && typeof e === "object" && "body" in e ? ((e as { body: unknown }).body as Record<string, unknown> | undefined) : undefined;
  const reason = typeof body?.reason === "string" ? body.reason : "";
  if (code === "webhook_url") return t(`integrations.webhooks.urlErrors.${reason || "invalid_url"}`);
  if (code === "webhooks_disabled") return t("integrations.webhooks.disabledServer");
  if (code === "webhook_limit") return t("integrations.webhooks.limit");
  return tokenFailure(t as never, e);
}

/** «Workspace › Integraciones › Webhooks» (INT-03, bocetos 4, 5 and 6). Every
 *  member sees the list (without the URL's path); only a Test Manager
 *  (`manager`) creates, edits, tests, rotates and deletes. */
export function WebhooksSection({ workspace, manager }: { workspace: { id: string; name: string }; manager: boolean }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [hooks, setHooks] = useState<Webhook[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Webhook | "new" | null>(null);
  const [secret, setSecret] = useState<{ name: string; secret: string } | null>(null);
  const [inspecting, setInspecting] = useState<Webhook | null>(null);
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await webhooksApi.list(workspace.id);
      // The projects a webhook may be limited to (the same list as tokens).
      if (manager) setProjects((await tokensApi.workspace(workspace.id)).projects);
      setHooks(res.webhooks);
      setEnabled(res.enabled);
      setError(null);
    } catch (e) {
      setError(hookFailure(t, e));
    }
  }, [workspace.id, manager, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      toast(done, "success");
      await load();
    } catch (e) {
      toast(hookFailure(t, e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function rotate(h: Webhook) {
    const ok = await confirm({
      title: t("integrations.webhooks.rotateTitle", { name: h.name }),
      message: t("integrations.webhooks.rotateBody"),
      confirmLabel: t("integrations.webhooks.rotate"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await webhooksApi.rotate(workspace.id, h.id);
      setSecret({ name: h.name, secret: res.secret });
      await load();
    } catch (e) {
      toast(hookFailure(t, e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(h: Webhook) {
    const ok = await confirm({
      title: t("integrations.webhooks.deleteTitle", { name: h.name }),
      message: t("integrations.webhooks.deleteBody"),
      confirmLabel: t("integrations.webhooks.delete"),
      danger: true,
    });
    if (ok) await run(() => webhooksApi.remove(workspace.id, h.id), t("integrations.webhooks.deleted", { name: h.name }));
  }

  const date = (iso: string) => new Date(iso).toLocaleString(i18n.language, { dateStyle: "medium", timeStyle: "short" });

  return (
    <section className="ws-section" aria-labelledby="int-webhooks" data-testid="webhooks">
      <div className="int-head">
        <div className="ui-title-row">
          <h2 id="int-webhooks" className="ws-section__title">
            {t("integrations.webhooks.title")}
          </h2>
          <InfoTip id="int-webhooks-help" label={t("integrations.webhooks.title")}>
            {t("integrations.webhooks.hint")}
          </InfoTip>
        </div>
        {manager && enabled && (
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => setEditing("new")} data-testid="webhook-new">
            {t("integrations.webhooks.new")}
          </button>
        )}
      </div>
      {!enabled && <Alert kind="info">{t("integrations.webhooks.disabledServer")}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      {hooks && hooks.length === 0 && enabled && <p className="int-muted">{t("integrations.webhooks.none")}</p>}
      {hooks && hooks.length > 0 && (
        <div className="ws-table-wrap">
          <table className="ws-table int-table" data-testid="webhooks-table">
            <thead>
              <tr>
                <th scope="col">{t("integrations.webhooks.name")}</th>
                <th scope="col">{t("integrations.webhooks.url")}</th>
                <th scope="col">{t("integrations.webhooks.eventsLabel")}</th>
                <th scope="col">{t("integrations.tokens.project")}</th>
                <th scope="col">{t("integrations.webhooks.last")}</th>
                <th scope="col">{t("integrations.tokens.status")}</th>
                {manager && <th scope="col">{t("integrations.tokens.actions")}</th>}
              </tr>
            </thead>
            <tbody>
              {hooks.map((h) => (
                <tr key={h.id} data-testid={`webhook-${h.id}`}>
                  <td>{h.name}</td>
                  <td>
                    <code className="int-prefix">{h.url}</code>
                  </td>
                  <td>
                    {h.events.map((e) => (
                      <code key={e} className="int-chip">
                        {e}
                      </code>
                    ))}
                  </td>
                  <td>{h.projectName ?? t("integrations.webhooks.allProjects")}</td>
                  <td className="int-num">
                    {h.lastDelivery ? (
                      <>
                        <span className={`int-pill int-pill--${h.lastDelivery.status === "delivered" ? "ok" : "warn"}`}>
                          {h.lastDelivery.httpStatus ?? t(`integrations.webhooks.statuses.${h.lastDelivery.status}`)}
                        </span>{" "}
                        {date(h.lastDelivery.at)}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <span className={`int-pill int-pill--${h.active ? (h.consecutiveFailures > 0 ? "warn" : "ok") : "err"}`}>
                      {h.active
                        ? h.consecutiveFailures > 0
                          ? t("integrations.webhooks.failing", { count: h.consecutiveFailures })
                          : t("integrations.status.active")
                        : t(`integrations.webhooks.off.${h.disabledReason ?? "manual"}`)}
                    </span>
                  </td>
                  {manager && (
                    <td>
                      <div className="int-actions">
                        <button type="button" className="ui-btn ui-btn--small" disabled={busy} onClick={() => setInspecting(h)}>
                          {t("integrations.webhooks.deliveries")}
                        </button>
                        <button type="button" className="ui-btn ui-btn--small" disabled={busy} onClick={() => setEditing(h)}>
                          {t("integrations.webhooks.edit")}
                        </button>
                        {h.active ? (
                          <button
                            type="button"
                            className="ui-btn ui-btn--small"
                            disabled={busy}
                            onClick={() => void run(() => webhooksApi.test(workspace.id, h.id), t("integrations.webhooks.testQueued"))}
                            data-testid={`webhook-test-${h.id}`}
                          >
                            {t("integrations.webhooks.test")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="ui-btn ui-btn--small"
                            disabled={busy}
                            onClick={() =>
                              void run(() => webhooksApi.update(workspace.id, h.id, { active: true }), t("integrations.webhooks.activated", { name: h.name }))
                            }
                          >
                            {t("integrations.webhooks.activate")}
                          </button>
                        )}
                        <button type="button" className="ui-btn ui-btn--small" disabled={busy} onClick={() => void rotate(h)}>
                          {t("integrations.webhooks.rotate")}
                        </button>
                        <button type="button" className="ui-btn ui-btn--small ui-btn--danger" disabled={busy} onClick={() => void remove(h)}>
                          {t("integrations.webhooks.delete")}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <WebhookDialog
          hook={editing === "new" ? null : editing}
          projects={projects}
          save={async (input) => {
            if (editing === "new") {
              const res = await webhooksApi.create(workspace.id, input);
              setSecret({ name: res.view.name, secret: res.secret });
            } else {
              await webhooksApi.update(workspace.id, editing.id, input);
              toast(t("integrations.webhooks.saved", { name: input.name }), "success");
            }
            setEditing(null);
            await load();
          }}
          onCancel={() => setEditing(null)}
          failure={(e) => hookFailure(t, e)}
        />
      )}
      {secret && <SecretDialog name={secret.name} secret={secret.secret} onDone={() => setSecret(null)} />}
      {inspecting && <DeliveriesDialog workspaceId={workspace.id} hook={inspecting} onClose={() => setInspecting(null)} />}
      {dialog}
    </section>
  );
}

/** «Nuevo webhook» / «Editar webhook» (boceto 5). */
function WebhookDialog({
  hook,
  projects,
  save,
  onCancel,
  failure,
}: {
  hook: Webhook | null;
  projects: WorkspaceProject[];
  save: (input: WebhookInput) => Promise<void>;
  onCancel: () => void;
  failure: (e: unknown) => string;
}) {
  const { t } = useTranslation();
  const id = useId();
  // A refused target is said in the dialog, next to what has to change.
  const [problem, setProblem] = useState<string | null>(null);
  const [name, setName] = useState(hook?.name ?? "");
  const [url, setUrl] = useState(hook?.url ?? "");
  const [projectId, setProjectId] = useState(hook?.projectId ?? "");
  const [events, setEvents] = useState<WebhookEvent[]>(hook?.events ?? DEFAULT_EVENTS);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setTried(true);
    if (!name.trim() || !url.trim() || events.length === 0) return;
    setBusy(true);
    setProblem(null);
    try {
      await save({ name: name.trim(), url: url.trim(), projectId: projectId || null, events });
    } catch (e) {
      setProblem(failure(e));
      setBusy(false);
    }
  }

  return (
    <Dialog labelledBy={`${id}-title`} onClose={onCancel} dismissable={!busy}>
      <h3 id={`${id}-title`} className="cd__title">
        {t(hook ? "integrations.webhooks.editTitle" : "integrations.webhooks.newTitle")}
      </h3>
      <FormField label={t("integrations.webhooks.name")} issue={tried ? required(name) : null} required>
        {(p) => <input {...p} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} data-testid="webhook-name" />}
      </FormField>
      <FormField label={t("integrations.webhooks.url")} hint={t("integrations.webhooks.urlHint")} issue={tried ? required(url) : null} required>
        {(p) => (
          <input {...p} type="url" value={url} maxLength={2000} onChange={(e) => setUrl(e.target.value)} placeholder="https://" data-testid="webhook-url" />
        )}
      </FormField>
      <FormField label={t("integrations.tokens.project")}>
        {(p) => (
          <Select<string>
            id={p.id}
            value={projectId}
            onChange={setProjectId}
            options={[{ value: "", label: t("integrations.webhooks.allProjects") }, ...projects.map((x) => ({ value: x.id, label: x.name }))]}
          />
        )}
      </FormField>
      <fieldset className="int-scopes">
        <legend>{t("integrations.webhooks.eventsLabel")}</legend>
        {WEBHOOK_EVENTS.map((e) => (
          <label key={e} className="int-scope">
            <input
              type="checkbox"
              checked={events.includes(e)}
              onChange={(ev) => setEvents((s) => WEBHOOK_EVENTS.filter((x) => (x === e ? ev.target.checked : s.includes(x))))}
              data-testid={`webhook-event-${e}`}
            />
            <span>{t(eventKey(e))}</span>
          </label>
        ))}
        {tried && events.length === 0 && (
          <p className="int-issue" role="alert">
            {t("integrations.webhooks.eventRequired")}
          </p>
        )}
      </fieldset>
      {problem && <Alert kind="error">{problem}</Alert>}
      <div className="cd__actions">
        <button type="button" className="cd__cancel" onClick={onCancel} disabled={busy}>
          {t("common.cancel")}
        </button>
        <button type="button" className="cd__confirm" onClick={() => void submit()} disabled={busy} data-testid="webhook-save">
          {t(hook ? "integrations.webhooks.save" : "integrations.webhooks.create")}
        </button>
      </div>
    </Dialog>
  );
}

/** The signing secret, once (boceto 5, right). */
function SecretDialog({ name, secret, onDone }: { name: string; secret: string; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const id = useId();
  const [saved, setSaved] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      toast(t("integrations.tokens.copied"), "success");
    } catch {
      document.getElementById(`${id}-secret`)?.focus();
    }
  }
  return (
    <Dialog labelledBy={`${id}-title`} describedBy={`${id}-once`} dismissable={false}>
      <h3 id={`${id}-title`} className="cd__title">
        {t("integrations.webhooks.secretTitle", { name })}
      </h3>
      <Alert kind="warning">
        <span id={`${id}-once`}>{t("integrations.webhooks.secretOnce")}</span>
      </Alert>
      <div className="int-secret">
        <code id={`${id}-secret`} tabIndex={-1} data-testid="webhook-secret">
          {secret}
        </code>
        <button type="button" className="ui-btn ui-btn--small" onClick={() => void copy()}>
          {t("integrations.tokens.copy")}
        </button>
        <InfoTip id={`${id}-secret-help`} label={t("integrations.webhooks.secretTitle", { name })}>
          {t("integrations.webhooks.secretHint")}
        </InfoTip>
      </div>
      <label className="int-scope">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} data-testid="webhook-saved" />
        <span>{t("integrations.tokens.saved")}</span>
      </label>
      <div className="cd__actions">
        <button type="button" className="cd__confirm" onClick={onDone} disabled={!saved} data-testid="webhook-secret-done">
          {t("integrations.tokens.done")}
        </button>
      </div>
    </Dialog>
  );
}

/** «Entregas» (boceto 6): what was sent, what the target answered, retry. */
function DeliveriesDialog({ workspaceId, hook, onClose }: { workspaceId: string; hook: Webhook; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const id = useId();
  const [list, setList] = useState<Delivery[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only what identifies the list: never `toast`, whose identity may change
  // on every render (no provider), which would reload without end.
  const load = useCallback(async () => {
    try {
      const l = await webhooksApi.deliveries(workspaceId, hook.id);
      setList(l);
      setOpen((o) => o ?? l[0]?.id ?? null);
      setError(null);
    } catch (e) {
      setError(hookFailure(t, e));
    }
  }, [workspaceId, hook.id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = list?.find((d) => d.id === open) ?? null;
  const date = (iso: string) => new Date(iso).toLocaleString(i18n.language, { dateStyle: "medium", timeStyle: "medium" });

  return (
    <Dialog labelledBy={`${id}-title`} onClose={onClose} className="cd int-deliveries">
      <h3 id={`${id}-title`} className="cd__title">
        {t("integrations.webhooks.deliveriesTitle", { name: hook.name })}
      </h3>
      {error && <Alert kind="error">{error}</Alert>}
      {list && list.length === 0 && <p className="int-muted">{t("integrations.webhooks.noDeliveries")}</p>}
      {list && list.length > 0 && (
        <div className="int-split">
          <ul className="int-dl" aria-label={t("integrations.webhooks.deliveries")}>
            {list.map((d) => (
              <li key={d.id}>
                <button type="button" className={`int-dl__row${d.id === open ? " is-on" : ""}`} onClick={() => setOpen(d.id)} aria-current={d.id === open}>
                  <span className={`int-pill int-pill--${d.status === "delivered" ? "ok" : d.status === "abandoned" ? "err" : "warn"}`}>
                    {d.lastStatus ?? t(`integrations.webhooks.statuses.${d.status}`)}
                  </span>{" "}
                  <code>{d.eventType}</code>
                  <span className="int-muted"> · {date(d.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
          {current && (
            <div className="int-dl__detail" data-testid="delivery-detail">
              <dl className="int-kv">
                <dt>{t("integrations.webhooks.state")}</dt>
                <dd>
                  {t(`integrations.webhooks.statuses.${current.status}`)} · {t("integrations.webhooks.attempt", { n: current.attempt })}
                </dd>
                {current.nextAttemptAt && current.status !== "delivered" && (
                  <>
                    <dt>{t("integrations.webhooks.next")}</dt>
                    <dd>{date(current.nextAttemptAt)}</dd>
                  </>
                )}
                {(current.lastStatus !== null || current.lastError) && (
                  <>
                    <dt>{t("integrations.webhooks.answer")}</dt>
                    <dd>
                      {[current.lastStatus, current.lastDurationMs !== null ? `${current.lastDurationMs} ms` : null, current.lastError, current.lastResponse]
                        .filter((x) => x !== null && x !== "")
                        .join(" · ")}
                    </dd>
                  </>
                )}
              </dl>
              <pre className="int-snippet">{JSON.stringify(current.payload, null, 2)}</pre>
              <button
                type="button"
                className="ui-btn ui-btn--small"
                onClick={async () => {
                  try {
                    await webhooksApi.redeliver(workspaceId, hook.id, current.id);
                    toast(t("integrations.webhooks.requeued"), "success");
                    await load();
                  } catch (e) {
                    toast(hookFailure(t, e), "error");
                  }
                }}
                data-testid="delivery-redeliver"
              >
                {t("integrations.webhooks.redeliver")}
              </button>
            </div>
          )}
        </div>
      )}
      <div className="cd__actions">
        <button type="button" className="cd__confirm" onClick={onClose}>
          {t("common.close")}
        </button>
      </div>
    </Dialog>
  );
}
