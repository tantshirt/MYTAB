"use client";

import type { ReactNode } from "react";
import { useTelegramBootstrap } from "./useTelegramBootstrap";

type TelegramBootstrapGateProps = {
  children: ReactNode;
};

/** Runs Telegram bootstrap once Privy auth is established (Story 1.7). */
export function TelegramBootstrapGate({ children }: TelegramBootstrapGateProps) {
  useTelegramBootstrap();
  return <>{children}</>;
}
