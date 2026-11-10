import { useCallback, useEffect, useState } from "react";
import { pullPreference, readLocalPreference, savePreference } from "@modules/profile";
import { readBoard, type Board } from "./board";

const KEY = "home.board" as const;

const local = (userId: string): Board =>
  readBoard(readLocalPreference(userId, KEY)?.value).board;

/** The account's Inicio board (UX-27): this device's copy at once, then the
 *  account's when the server answers, again after each sync (another device
 *  may have changed it). `save` keeps a new one for the account. */
export function useHomeBoard(userId: string): { board: Board; save: (b: Board) => void } {
  const [state, setState] = useState(() => ({ userId, board: local(userId) }));
  // Another account signed in: its own board, not the previous one's.
  const board = state.userId === userId ? state.board : local(userId);

  useEffect(() => {
    let alive = true;
    setState({ userId, board: local(userId) });
    const pull = () =>
      void pullPreference(userId, KEY).then((p) => {
        if (alive && p) setState({ userId, board: readBoard(p.value).board });
      });
    pull();
    window.addEventListener("pharos:synced", pull);
    return () => {
      alive = false;
      window.removeEventListener("pharos:synced", pull);
    };
  }, [userId]);

  const save = useCallback(
    (next: Board) => {
      setState({ userId, board: next });
      void savePreference(userId, KEY, next);
    },
    [userId],
  );

  return { board, save };
}
