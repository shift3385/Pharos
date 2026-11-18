import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import { isTauri } from "@shared/platform";
import { checkServer, serverHost, type ServerInfo } from "@shared/platform/serverUrl";
import "./ServerPicker.css";

/** What the line says after a server was just picked. */
export interface ConnectedNotice {
  host: string;
  version: string | null;
  local: boolean;
  readOnly: boolean;
}

type Reach = "checking" | "ok" | "offline";

/** «Servidor: pharos.example.com 🔒 Cambiar» on the desktop sign-in screen
 *  (SEC-10, sketch 1). Green dot: the server answered just now; grey: not
 *  (the app still opens offline with a cached session). The web shows
 *  nothing: its server is the one that serves it. */
export function ServerLine({
  info,
  onChange,
  notice,
}: {
  info: ServerInfo;
  onChange: () => void;
  notice?: ConnectedNotice | null;
}) {
  const { t } = useTranslation();
  const [reach, setReach] = useState<Reach>("checking");
  const desktop = isTauri();

  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;
    setReach("checking");
    checkServer(info.origin).then(
      () => !cancelled && setReach("ok"),
      () => !cancelled && setReach("offline"),
    );
    return () => {
      cancelled = true;
    };
  }, [desktop, info.origin]);

  if (!desktop) return null;
  const host = serverHost(info.origin);

  return (
    <div className="server-line-wrap">
      <div className="server-line" data-testid="server-line">
        <span className={`server-line__dot server-line__dot--${reach}`} aria-hidden="true" />
        <span className="server-line__key">{t("server.line.label")}</span>
        <span className="server-line__host" title={info.origin} data-testid="server-line-host">
          {info.local ? t("server.line.local", { host }) : host}
        </span>
        {!info.local && (
          <Lock size={14} className="server-line__lock" aria-label={t("server.line.secure")} role="img" />
        )}
        {reach === "offline" && <span className="server-line__state">{t("server.line.offline")}</span>}
        <button type="button" className="server-line__change" onClick={onChange} data-testid="server-change">
          {t("server.line.change")}
        </button>
      </div>
      {notice && (
        <p className="server-msg server-msg--ok" role="status">
          <b>{t("server.connected", { host: notice.host })}</b>
          <span>
            {notice.readOnly
              ? t("server.connectedReadOnly", { version: notice.version ?? "?" })
              : notice.local
                ? t("server.connectedLocal", { version: notice.version ?? "?" })
                : t("server.connectedSecure", { version: notice.version ?? "?" })}
          </span>
        </p>
      )}
    </div>
  );
}
