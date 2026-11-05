import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { TOAST_EVENT, type ToastDetail, type ToastKind } from "./notify";
import { StatusIcon } from "./StatusIcon";
import "./Toast.css";

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

type ToastFn = (message: string, kind?: ToastKind) => void;

const ToastContext = createContext<ToastFn | null>(null);

/** Errors and warnings interrupt (assertive) and stay longer. */
const urgent = (kind: ToastKind) => kind === "error" || kind === "warning";

let seq = 0;

/** App-wide transient notifications (e.g. "Plan saved"). Toasts live above the
 *  page tree so they survive a component unmounting right after a save. Code
 *  outside React raises them with `notify()` (./notify).
 *
 *  Colours follow the status convention (UX-10, SPEC §4): success green, error
 *  red, warning amber, info blue, each with its own icon and its kind spelled
 *  out for screen readers, so it never depends on colour alone. The brand
 *  accent is never used here. Warnings and errors stay longer and are
 *  announced assertively. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback<ToastFn>((message, kind = "success") => {
    const id = ++seq;
    setItems((s) => [...s, { id, message, kind }]);
    window.setTimeout(
      () => setItems((s) => s.filter((t) => t.id !== id)),
      urgent(kind) ? 8000 : 3000,
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

  const render = (item: ToastItem) => (
    <div key={item.id} className={`toast toast--${item.kind}`}>
      <StatusIcon kind={item.kind} className="toast__icon" />
      <span className="toast__text">
        <span className="sr-only">{t(`common.status.${item.kind}`)}: </span>
        {item.message}
      </span>
    </div>
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack">
        <div aria-live="assertive" role="alert">
          {items.filter((i) => urgent(i.kind)).map(render)}
        </div>
        <div aria-live="polite">
          {items.filter((i) => !urgent(i.kind)).map(render)}
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
