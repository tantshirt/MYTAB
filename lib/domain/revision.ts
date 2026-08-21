/** Stable failure code when a client submits against a stale tab revision (Story 5.1). */
export const STALE_REVISION = "STALE_REVISION";

export class RevisionError extends Error {
  readonly code = STALE_REVISION;

  constructor(
    message: string,
    readonly expectedRevision: number,
    readonly actualRevision: number,
  ) {
    super(message);
    this.name = "RevisionError";
  }
}

/** Returns the next monotonic revision (FR-B4). */
export function nextRevision(currentRevision: number): number {
  if (!Number.isInteger(currentRevision) || currentRevision < 0) {
    throw new RevisionError(
      "nextRevision: current revision must be a non-negative integer",
      currentRevision,
      currentRevision,
    );
  }
  return currentRevision + 1;
}

/** Rejects mutations when the client-held revision does not match the tab (FR-B4, FR-C3). */
export function assertRevisionMatch(
  clientRevision: number,
  tabRevision: number,
): void {
  if (!Number.isInteger(clientRevision) || clientRevision < 0) {
    throw new RevisionError(
      "assertRevisionMatch: client revision must be a non-negative integer",
      clientRevision,
      tabRevision,
    );
  }
  if (clientRevision !== tabRevision) {
    throw new RevisionError(
      `Tab revision mismatch: client holds ${clientRevision}, tab is at ${tabRevision}`,
      clientRevision,
      tabRevision,
    );
  }
}

/** Builds a revision-scoped key for deduplication and snapshot identity. */
export function revisionKey(tabId: string, revision: number): string {
  return `${tabId}:r${revision}`;
}
