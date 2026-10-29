import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { TOAST_EVENT, type ToastDetail, type ToastKind } from "./notify";
import "./Toast.css";

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

type ToastFn = (message: string, kind?: ToastKind) => void;

const ToastContext = createContext<ToastFn | null>(null);

const ICON: Record<ToastKind, string> = {
  success: "✓",
  warning: "!",
  error: "✕",
};

let seq = 0;

/** App-wide transient notifications (e.g. "Plan saved"). Toasts live above the
 *  page tree so they survive a component unmounting right after a save. Code
 *  outside React raises them with `notify()` (./notify). Warnings and errors
 *  stay longer and are announced assertively. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback<ToastFn>((message, kind = "success") => {
    const id = ++seq;
    setItems((s) => [...s, { id, message, kind }]);
    window.setTimeout(
      () => setItems((s) => s.filter((t) => t.id !== id)),
      kind === "success" ? 3000 : 8000,
    );
  }, []);

  useEffect(() => {
    const onToast = (e: Event) => {
      const { message, kind } = (e as CustomEvent<ToastDetail>).detail;
      toast(message, kind);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, [toast]);

  const polite = items.filter((t) => t.kind === "success");
  const urgent = items.filter((t) => t.kind !== "success");
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack">
        <div aria-live="assertive" role="alert">
          {urgent.map((t) => (
            <div key={t.id} className={`toast toast--${t.kind}`}>
              {ICON[t.kind]} {t.message}
            </div>
          ))}
        </div>
        <div aria-live="polite">
          {polite.map((t) => (
            <div key={t.id} className="toast">
              {ICON.success} {t.message}
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

/** Returns a `toast(message, kind?)` function (no-op if no provider is mounted). */
// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastFn {
  return useContext(ToastContext) ?? (() => {});
}
