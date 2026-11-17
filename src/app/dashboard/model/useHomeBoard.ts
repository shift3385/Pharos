import { useCallback, useEffect, useState } from "react";
import { pullPreference, readLocalPreference, savePreference } from "@modules/profile";
import { readBoard, type Board, type GadgetId } from "./board";

const KEY = "home.board" as const;

const local = (userId: string) => readBoard(readLocalPreference(userId, KEY)?.value);

/** The account's Inicio board (UX-27): this device's copy at once, then the
 *  account's when the server answers, again after each sync (another device
 *  may have changed it). `save` keeps a new one for the account.
 *  `waiting`: gadgets new to the stored board that found no room on screen
 *  (DOC-06, D6): Inicio says so until the board is saved again. */
export function useHomeBoard(userId: string): {
  board: Board;
  waiting: GadgetId[];
  save: (b: Board) => void;
} {
  const [state, setState] = useState(() => ({ userId, ...pick(local(userId)) }));
  // Another account signed in: its own board, not the previous one's.
  const current = state.userId === userId ? state : { userId, ...pick(local(userId)) };

  useEffect(() => {
    let alive = true;
    setState({ userId, ...pick(local(userId)) });
    const pull = () =>
      void pullPreference(userId, KEY).then((p) => {
        if (alive && p) setState({ userId, ...pick(readBoard(p.value)) });
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
      setState({ userId, board: next, waiting: [] });
      void savePreference(userId, KEY, next);
    },
    [userId],
  );

  return { board: current.board, waiting: current.waiting, save };
}

const pick = (r: { board: Board; waiting: GadgetId[] }) => ({ board: r.board, waiting: r.waiting });
