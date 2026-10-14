import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Terminal } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught application error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    window.location.href = '/';
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorMessage = this.state.error?.message || 'An unexpected rendering error occurred.';
      const componentStack = this.state.errorInfo?.componentStack;

      return (
        <div className="min-h-screen w-full bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex items-center justify-center p-4 font-[Inter,system-ui,sans-serif]">
          <div className="w-full max-w-lg bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl p-6 sm:p-8 flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-red-100 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 grid place-items-center shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-black dark:text-white leading-tight">
                  Application Rendering Error
                </h1>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  The dashboard caught an unexpected error during initial layout render.
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-zinc-100 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 p-3.5 text-xs font-mono text-zinc-800 dark:text-zinc-200 break-words max-h-48 overflow-y-auto">
              <div className="text-red-600 dark:text-red-400 font-semibold mb-1">
                {errorMessage}
              </div>
              {componentStack && (
                <pre className="text-[11px] text-zinc-500 dark:text-zinc-400 whitespace-pre-wrap mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                  {componentStack}
                </pre>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:flex-1 h-9 px-4 rounded-xl bg-black dark:bg-white text-white dark:text-black text-xs font-medium hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Reload Page</span>
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                className="w-full sm:flex-1 h-9 px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-xs font-medium transition-colors inline-flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <Home className="h-3.5 w-3.5" />
                <span>Reset to Dashboard</span>
              </button>
            </div>

            <div className="text-[11px] text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5 justify-center border-t border-zinc-100 dark:border-zinc-900 pt-3">
              <Terminal className="h-3 w-3" />
              <span>Diagnostic mode active. Check browser console for full trace.</span>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
