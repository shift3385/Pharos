import { useCallback, useEffect, useState } from "react";
import { getServer, serverUrl, type ServerInfo } from "@shared/platform/serverUrl";

const FALLBACK: ServerInfo = { origin: serverUrl(), local: false, recent: [] };

/** The server this app signs in to, and a way to read it again after the user
 *  picks another. Until it is read, the build's server. */
export function useServerInfo(): { info: ServerInfo; reload: () => void } {
  const [info, setInfo] = useState<ServerInfo>(FALLBACK);
  const [round, setRound] = useState(0);
  useEffect(() => {
    let cancelled = false;
    getServer()
      .then((next) => {
        if (!cancelled) setInfo(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [round]);
  const reload = useCallback(() => setRound((r) => r + 1), []);
  return { info, reload };
}
