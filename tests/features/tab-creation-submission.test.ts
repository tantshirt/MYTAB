import { describe, expect, it, vi } from "vitest";
import { submitTabCreation } from "@/features/bills/tabCreationSubmission";

describe("new-tab submission and navigation seam", () => {
  it("persists a personal scan-first tab before routing to its receipt", async () => {
    const createPersonal = vi.fn(async () => ({ token: "personal-token" }));
    const createChat = vi.fn(async () => ({ token: "unused" }));

    const result = await submitTabCreation({
      origin: "personal",
      title: " Dinner ",
      merchantName: "",
      displayCurrency: "THB",
      receiveMint: "receive-mint",
      payerUserId: "users:organizer",
      seats: 4,
      captureMethod: "scan",
      scanAvailable: true,
      idempotencyKey: "create-personal-1",
    }, { createPersonal, createChat });

    expect(createPersonal).toHaveBeenCalledWith({
      name: "Dinner",
      seats: 4,
      merchantName: undefined,
      displayCurrency: "THB",
      receiveMint: "receive-mint",
      idempotencyKey: "create-personal-1",
    });
    expect(createChat).not.toHaveBeenCalled();
    expect(result).toEqual({
      token: "personal-token",
      destination: "/tabs/personal-token/receipt",
    });
  });

  it("persists a group invite/manual-first tab before routing to its bill", async () => {
    const createPersonal = vi.fn(async () => ({ token: "unused" }));
    const createChat = vi.fn(async () => ({ token: "group-token" }));

    const result = await submitTabCreation({
      origin: "chat",
      groupId: "groups:one",
      title: "Lunch",
      merchantName: " Canteen ",
      displayCurrency: "KWD",
      receiveMint: "receive-mint",
      payerUserId: "users:payer",
      captureMethod: "manual",
      scanAvailable: true,
      idempotencyKey: "create-group-1",
    }, { createPersonal, createChat });

    expect(createChat).toHaveBeenCalledWith({
      groupId: "groups:one",
      name: "Lunch",
      merchantName: "Canteen",
      displayCurrency: "KWD",
      payerUserId: "users:payer",
      receiveMint: "receive-mint",
      idempotencyKey: "create-group-1",
    });
    expect(createPersonal).not.toHaveBeenCalled();
    expect(result.destination).toBe("/tabs/group-token");
  });
});
