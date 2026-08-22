"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "./error-state";

export type SurfaceErrorBoundaryProps = {
  /** §4.3 copy for this surface, e.g. "Couldn't load your tabs." */
  headline: string;
  /** Retry label. Defaults to "Try again". */
  retryLabel?: string;
  children: ReactNode;
};

type SurfaceErrorBoundaryState = { failed: boolean };

/**
 * Per-surface error boundary (POLISH-SPEC §4.3).
 *
 * Before this, `PaymentProgress`'s failed branch was the only error state in
 * the product: a render failure anywhere else showed Next's default page
 * inside the Telegram webview. This renders the surface's own §4 copy in the
 * flow instead, and `reset` re-mounts the subtree.
 *
 * The mechanism goes to the console and nowhere else — no code, no digest, no
 * stack trace on screen (§4.0 rule 2).
 */
export class SurfaceErrorBoundary extends Component<
  SurfaceErrorBoundaryProps,
  SurfaceErrorBoundaryState
> {
  state: SurfaceErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): SurfaceErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  private reset = () => {
    this.setState({ failed: false });
  };

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <ErrorState
          headline={this.props.headline}
          actions={[{ label: this.props.retryLabel ?? "Try again", onPress: this.reset }]}
        />
      );
    }
    return this.props.children;
  }
}
