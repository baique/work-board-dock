import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional fallback UI. Receives the error and a retry callback. */
  fallback?: (error: Error, retry: () => void) => ReactNode;
  /** Optional context label for error logging. */
  context?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/** React ErrorBoundary — 挂件渲染错误兜底，避免白屏。 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const ctx = this.props.context ?? "Unknown";
    console.error(`[ErrorBoundary:${ctx}] Rendering error:`, error);
    console.error(`[ErrorBoundary:${ctx}] Component stack:`, errorInfo.componentStack);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleRetry);
      }
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-[#1c1c1e] text-white">
          <div className="text-sm text-white/80">TIP 出错了</div>
          <div className="max-w-[240px] text-center text-xs text-white/50">
            {this.state.error.message}
          </div>
          <button
            type="button"
            onClick={this.handleRetry}
            className="mt-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/90 hover:bg-white/15"
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
