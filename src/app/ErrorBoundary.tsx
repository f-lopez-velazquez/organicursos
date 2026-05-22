import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("OrganiCursos render error", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-hero-radial px-6 py-12 text-slate-100">
          <div className="mx-auto max-w-3xl">
            <div className="glass-panel p-8">
              <p className="text-sm uppercase tracking-[0.24em] text-amber-200">Error de interfaz</p>
              <h1 className="mt-3 text-3xl font-semibold text-white">La pantalla actual no pudo renderizarse</h1>
              <p className="mt-4 text-sm leading-6 text-slate-300">
                La aplicacion sigue abierta, pero esta vista encontro un dato o estado inesperado.
              </p>
              {this.state.message ? <p className="mt-4 text-sm text-slate-400">{this.state.message}</p> : null}
              <div className="mt-6">
                <Button onClick={() => window.location.reload()}>Recargar interfaz</Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
