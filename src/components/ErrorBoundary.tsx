import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = "Une erreur inattendue est survenue.";
      
      try {
        const message = this.state.error?.message || "";
        if (message && message.trim().startsWith('{')) {
          const parsedError = JSON.parse(message);
          if (parsedError.error && typeof parsedError.error === 'string' && parsedError.error.includes("Missing or insufficient permissions")) {
            errorMessage = "Vous n'avez pas les permissions nécessaires pour effectuer cette action.";
          } else if (parsedError.error) {
            errorMessage = String(parsedError.error);
          }
        } else if (message) {
          errorMessage = message;
        }
      } catch (e) {
        // Not a JSON error or other parsing issue
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center border border-red-100">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-stone-900 mb-2">Oups !</h2>
            <p className="text-stone-500 mb-8">{errorMessage}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full flex items-center justify-center gap-2 bg-stone-900 text-white py-4 px-6 rounded-2xl font-medium hover:bg-stone-800 transition-all"
            >
              <RefreshCw className="w-5 h-5" />
              Recharger l'application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
