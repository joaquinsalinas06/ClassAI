import { Component, type ErrorInfo, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";

/** Catches render errors per region so one broken panel never blanks the app. */
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string; resetKey?: unknown }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("[ClassAI] panel error", error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: unknown }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <EmptyState
        illustration="plug"
        title={`No se pudo mostrar ${this.props.label ?? "esta sección"}`}
        description="El resto de la página sigue funcionando. Vuelve a intentarlo; si persiste, recarga la página."
        action={<Button size="sm" icon={<RotateCcw size={14} />} onClick={() => this.setState({ error: null })}>Reintentar</Button>}
      />
    );
  }
}
