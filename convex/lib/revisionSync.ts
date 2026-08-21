import {
  assertRevisionMatch,
  nextRevision,
  RevisionError,
  STALE_REVISION,
} from "../../lib/domain/revision";

export { STALE_REVISION };

export class RevisionSyncError extends Error {
  readonly code = STALE_REVISION;

  constructor(
    message: string,
    readonly clientRevision: number,
    readonly tabRevision: number,
  ) {
    super(message);
    this.name = "RevisionSyncError";
  }
}

/** Validates client revision against the tab (Story 5.1 AC2). */
export function checkClientRevision(clientRevision: number, tabRevision: number): void {
  try {
    assertRevisionMatch(clientRevision, tabRevision);
  } catch (error) {
    if (error instanceof RevisionError) {
      throw new RevisionSyncError(
        error.message,
        error.expectedRevision,
        error.actualRevision,
      );
    }
    throw new RevisionSyncError("Stale revision", clientRevision, tabRevision);
  }
}

/** Returns the next revision after a draft edit (Story 5.1 AC1). */
export function bumpRevision(currentRevision: number): number {
  return nextRevision(currentRevision);
}
