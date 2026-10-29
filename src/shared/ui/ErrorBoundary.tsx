import { Component, type ErrorInfo, type ReactNode } from "react";
import { logClientError } from "@shared/diagnostics";
import { ErrorFallback } from "./ErrorFallback";

interface Props {
  children: ReactNode;
  /** When this value changes the boundary clears its error (e.g. the route). */
  resetKey?: unknown;
  /** `app` fills the window; `page` stays inside the shell's content area. */
  variant?: "app" | "page";
}

interface State {
  error: Error | null;
}

/** Catches render errors below it, logs them (BASE-08) and shows a fallback
 *  with retry, reload and "Exportar diagnóstico" instead of a blank window. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logClientError(error, info.componentStack ?? undefined);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <ErrorFallback
        error={error}
        variant={this.props.variant ?? "page"}
        onRetry={() => this.setState({ error: null })}
      />
    );
  }
}
