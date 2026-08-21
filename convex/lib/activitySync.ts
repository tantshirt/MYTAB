import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { ACTIVITY_EVENT_TYPE, type ActivityEventPayload } from "../../lib/domain/activityTypes";

export type AppendActivityInput = {
  groupId: Id<"groups">;
  tabId?: Id<"tabs">;
  actorUserId?: Id<"users">;
  type: string;
  payload: ActivityEventPayload;
};

/** Appends an immutable activity event in the same transaction (Story 7.3 AC1). */
export async function appendActivityEvent(
  ctx: MutationCtx,
  input: AppendActivityInput,
): Promise<Id<"activityEvents">> {
  return ctx.db.insert("activityEvents", {
    groupId: input.groupId,
    tabId: input.tabId,
    actorUserId: input.actorUserId,
    type: input.type,
    payload: input.payload,
    createdAt: Date.now(),
  });
}

/** Rejects mutation attempts on existing activity rows (Story 7.3 AC2). */
export function assertActivityEventImmutable(): never {
  throw new Error("ACTIVITY_EVENT_IMMUTABLE");
}

export { ACTIVITY_EVENT_TYPE };
