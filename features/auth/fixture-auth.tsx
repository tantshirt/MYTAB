"use client";

import { createContext, useContext, type ReactNode } from "react";

export type FixtureAuthState = {
  ready: true;
  authenticated: true;
  isFixture: true;
  userId: "fixture-user";
};

const FIXTURE_AUTH_STATE: FixtureAuthState = {
  ready: true,
  authenticated: true,
  isFixture: true,
  userId: "fixture-user",
};

const FixtureAuthContext = createContext<FixtureAuthState | null>(null);

export function FixtureAuthProvider({ children }: { children: ReactNode }) {
  return (
    <FixtureAuthContext.Provider value={FIXTURE_AUTH_STATE}>
      {children}
    </FixtureAuthContext.Provider>
  );
}

export function useFixtureAuth(): FixtureAuthState | null {
  return useContext(FixtureAuthContext);
}
