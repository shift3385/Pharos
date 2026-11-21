import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerInfo } from "@modules/server-picker";
import { APP_BUILD, APP_VERSION } from "@shared/version";
import { Alert } from "@shared/ui/Alert";
import { FormField } from "@shared/ui/FormField";
import { InfoTip } from "@shared/ui/InfoTip";
import { Select } from "@shared/ui/Select";
import { useToast } from "@shared/ui/Toast";
import { WholeKeys } from "@shared/ui/WholeKeys";
import { tokensApi, type WorkspaceProject } from "../api/tokensApi";
import { buildCiSnippet, CI_FORMATS, DEFAULT_CI_FORMATS, SHA_PLACEHOLDER, type CiFormat } from "../model/ciSnippet";
import { tokenFailure } from "./failure";
import "./integrations.css";

/** YAML, one block per line: a line too long for the card wraps under its
 *  own text, two columns in (a hanging indent), never at column 0, where it
 *  would read as other YAML (FIX-41). The text, newlines included, stays the
 *  same: «Copiar» copies `text`, and selecting it by hand gives it back.
 *  A line breaks only at a space: keys and versions stay whole, and a
 *  trailing comment («# Pharos 0.6.0-beta.1») moves to the next line as a
 *  whole (FIX-46). */
export function IndentedLines({ text }: { text: string }) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    const hang = `${line.length - line.trimStart().length + 2}ch`;
    const at = line.indexOf(" # ");
    const code = at < 0 ? line : line.slice(0, at + 1);
    const comment = at < 0 ? "" : line.slice(at + 1);
    return (
      <span key={i} className="int-snippet__line" style={{ paddingLeft: hang, textIndent: `-${hang}` }}>
        <WholeKeys text={code} />
        {comment && <span className="t-key">{comment}</span>}
        {i < lines.length - 1 ? "\n" : ""}
      </span>
    );
  });
}

/** Where the placeholder goes in its translated notice. */
const MARK = "\u0001";

/** The SHA notice with the placeholder as code, whole on one line (FIX-49). */
function PlaceholderNotice({ text }: { text: string }) {
  const [before, after = ""] = text.split(MARK);
  return (
    <>
      {before}
      <code className="int-code">{SHA_PLACEHOLDER}</code>
      {after}
    </>
  );
}

/** Copies `text`; when the clipboard is refused, selects the element so the
 *  person can copy it by hand. */
async function copyOrSelect(text: string, elementId: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.getElementById(elementId);
    el?.focus();
    if (el) window.getSelection()?.selectAllChildren(el);
    return false;
  }
}

/** «Workspace › Integraciones › Conectar CI» (INT-04, ADR-0054 §5; boceto 7):
 *  the GitHub Actions step that uploads a project's reports, ready to copy,
 *  and the two settings it needs in GitHub. Every member sees it; the token
 *  itself is created above (Test Manager) and never appears in the YAML. */
export function ConnectCiSection({ workspace, manager }: { workspace: { id: string; name: string }; manager: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const id = useId();
  const { info } = useServerInfo();
  const [projects, setProjects] = useState<WorkspaceProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState("");
  const [formats, setFormats] = useState<CiFormat[]>(DEFAULT_CI_FORMATS);

  useEffect(() => {
    let live = true;
    tokensApi
      .workspace(workspace.id)
      .then((res) => {
        if (!live) return;
        setProjects(res.projects);
        setProject((p) => p || res.projects[0]?.id || "");
      })
      .catch((e: unknown) => live && setError(tokenFailure(t, e)));
    return () => {
      live = false;
    };
  }, [workspace.id, t]);

  const chosen = projects?.find((p) => p.id === project);
  const yaml = useMemo(
    () =>
      chosen
        ? buildCiSnippet({
            project: chosen.id,
            projectName: chosen.name,
            formats,
            actionSha: APP_BUILD.actionSha,
            version: APP_VERSION,
          })
        : "",
    [chosen, formats],
  );
  const placeholder = yaml.includes(SHA_PLACEHOLDER);

  function toggle(format: CiFormat, on: boolean) {
    setFormats((f) => CI_FORMATS.filter((x) => (x === format ? on : f.includes(x))));
  }

  async function copy(text: string, elementId: string) {
    if (await copyOrSelect(text, elementId)) toast(t("integrations.ci.copied"), "success");
  }

  return (
    <section className="ws-section" aria-labelledby={`${id}-title`} data-testid="connect-ci">
      <div className="ui-title-row">
        <h2 id={`${id}-title`} className="ws-section__title">
          {t("integrations.ci.title")}
        </h2>
        <InfoTip id={`${id}-help`} label={t("integrations.ci.title")}>
          {t("integrations.ci.hint")}
        </InfoTip>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {projects && projects.length === 0 && <p className="int-muted">{t("integrations.ci.noProjects")}</p>}
      {projects && projects.length > 0 && (
        <div className="int-ci">
          <div className="int-ci__form">
            <FormField label={t("integrations.ci.project")}>
              {(p) => (
                <Select<string>
                  id={p.id}
                  value={project}
                  onChange={setProject}
                  options={projects.map((x) => ({ value: x.id, label: x.name }))}
                  data-testid="ci-project"
                />
              )}
            </FormField>
            <fieldset className="int-scopes">
              <legend>{t("integrations.ci.formats")}</legend>
              {CI_FORMATS.map((f) => (
                <label key={f} className="int-scope">
                  <input
                    type="checkbox"
                    checked={formats.includes(f)}
                    onChange={(e) => toggle(f, e.target.checked)}
                    data-testid={`ci-format-${f}`}
                  />
                  <span>{t(`integrations.ci.format.${f}`)}</span>
                </label>
              ))}
            </fieldset>
          </div>
          <div className="int-ci__out">
            <div className="int-head">
              <p className="int-subtitle">{t("integrations.ci.yamlTitle")}</p>
              <button type="button" className="ui-btn ui-btn--small ui-btn--primary" onClick={() => void copy(yaml, `${id}-yaml`)} data-testid="ci-copy">
                {t("integrations.ci.copy")}
              </button>
            </div>
            <pre id={`${id}-yaml`} tabIndex={-1} className="int-snippet" data-testid="ci-yaml">
              <IndentedLines text={yaml} />
            </pre>
            {placeholder && (
              <Alert kind="info">
                <PlaceholderNotice
                  text={t("integrations.ci.placeholder", { placeholder: MARK })}
                />
              </Alert>
            )}
            <p className="int-subtitle">{t("integrations.ci.stepsTitle")}</p>
            <ol className="int-ci__steps">
              <li>
                {t("integrations.ci.stepSecret")} {!manager && t("integrations.ci.stepSecretAsk")}
              </li>
              <li>
                {t("integrations.ci.stepVariable")}{" "}
                <code
                  id={`${id}-url`}
                  tabIndex={-1}
                  className="int-code"
                  data-testid="ci-url"
                >
                  {info.origin}
                </code>{" "}
                <button type="button" className="ui-btn ui-btn--small" onClick={() => void copy(info.origin, `${id}-url`)} data-testid="ci-copy-url">
                  {t("integrations.ci.copy")}
                </button>
              </li>
              <li>{t("integrations.ci.stepPaste")}</li>
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}

/** «Usar en el CLI» (INT-01, boceto 8): the command that stores a personal
 *  token in the computer's credential store. The token is pasted at the
 *  prompt, never written in the command. */
export function UseInCliHint() {
  const { t } = useTranslation();
  const toast = useToast();
  const id = useId();
  const { info } = useServerInfo();
  const command = `pharos login --server ${info.origin}`;
  return (
    <div className="int-cli" data-testid="use-in-cli">
      <div className="int-head">
        <div className="ui-title-row">
          <p className="int-subtitle">{t("integrations.ci.cliTitle")}</p>
          <InfoTip id={`${id}-help`} label={t("integrations.ci.cliTitle")}>
            {t("integrations.ci.cliHint")}
          </InfoTip>
        </div>
        <button
          type="button"
          className="ui-btn ui-btn--small"
          onClick={() => void copyOrSelect(command, `${id}-cmd`).then((ok) => ok && toast(t("integrations.ci.copied"), "success"))}
          data-testid="cli-copy"
        >
          {t("integrations.ci.copy")}
        </button>
      </div>
      <pre id={`${id}-cmd`} tabIndex={-1} className="int-snippet">
        {command}
      </pre>
    </div>
  );
}
