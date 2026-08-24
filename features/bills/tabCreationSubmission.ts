import type { CaptureMethod } from "./NewTabForm";

type CreatedTab = { token?: string };

export type TabCreationSubmission = {
  origin: "personal" | "chat";
  title: string;
  merchantName: string;
  displayCurrency: string;
  receiveMint: string;
  payerUserId: string;
  seats?: number;
  groupId?: string;
  captureMethod: CaptureMethod;
  scanAvailable: boolean;
  idempotencyKey?: string;
};

export type TabCreationWriters = {
  createPersonal: (args: {
    name: string;
    seats: number;
    merchantName?: string;
    displayCurrency: string;
    receiveMint: string;
    idempotencyKey: string;
  }) => Promise<CreatedTab>;
  createChat: (args: {
    groupId: string;
    name: string;
    merchantName?: string;
    displayCurrency: string;
    payerUserId: string;
    receiveMint: string;
    idempotencyKey: string;
  }) => Promise<CreatedTab>;
};

/**
 * The shipping seam from either authoring door to the persisted tab route.
 *
 * Capture choice changes only the destination after creation. It never lets a
 * receipt upload target the synthetic setup key used before a tab exists.
 */
export async function submitTabCreation(
  input: TabCreationSubmission,
  writers: TabCreationWriters,
): Promise<{ token: string; destination: string }> {
  const merchantName = input.merchantName.trim() || undefined;
  const created = input.origin === "personal"
    ? await writers.createPersonal({
        name: input.title.trim(),
        seats: input.seats ?? 2,
        merchantName,
        displayCurrency: input.displayCurrency,
        receiveMint: input.receiveMint,
        idempotencyKey: input.idempotencyKey ?? "",
      })
    : await writers.createChat({
        groupId: input.groupId ?? "",
        name: input.title.trim(),
        merchantName,
        displayCurrency: input.displayCurrency,
        payerUserId: input.payerUserId,
        receiveMint: input.receiveMint,
        idempotencyKey: input.idempotencyKey ?? "",
      });

  if (!created.token) {
    throw new Error("TAB_CREATE_FAILED");
  }

  const destination = input.captureMethod === "scan" && input.scanAvailable
    ? `/tabs/${created.token}/receipt`
    : input.origin === "personal"
      ? `/tabs/${created.token}?invite=1`
      : `/tabs/${created.token}`;

  return { token: created.token, destination };
}
