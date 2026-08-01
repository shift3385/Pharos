import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import "./Toast.css";

interface ToastItem {
  id: number;
  message: string;
}

const ToastContext = createContext<((message: string) => void) | null>(null);

let seq = 0;

/** App-wide transient notifications (e.g. "Plan saved"). Toasts live above the
 *  page tree so they survive a component unmounting right after a save. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string) => {
    const id = ++seq;
    setItems((s) => [...s, { id, message }]);
    window.setTimeout(
      () => setItems((s) => s.filter((t) => t.id !== id)),
      3000,
    );
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast">
            ✓ {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Returns a `toast(message)` function (no-op if no provider is mounted). */
// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): (message: string) => void {
  return useContext(ToastContext) ?? (() => {});
}
