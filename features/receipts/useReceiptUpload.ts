"use client";

import { useCallback } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLiveMutation } from "@/features/convex/useConvexData";

export const RECEIPT_UPLOAD_UNAVAILABLE = "RECEIPT_UPLOAD_UNAVAILABLE";
export const RECEIPT_UPLOAD_FAILED = "RECEIPT_UPLOAD_FAILED";

/**
 * Ticket → Convex storage URL → POST the blob → finalize.
 * Convex storage accepts POST, not PUT.
 */
export async function postReceiptBlob(
  uploadUrl: string,
  file: Blob,
): Promise<Id<"_storage">> {
  const result = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": file.type || "image/jpeg" },
    body: file,
  });
  if (!result.ok) {
    throw new Error(RECEIPT_UPLOAD_FAILED);
  }
  const body = (await result.json()) as { storageId?: Id<"_storage"> };
  if (!body.storageId) {
    throw new Error(RECEIPT_UPLOAD_FAILED);
  }
  return body.storageId;
}

export function useReceiptUpload(): {
  upload: ((tabId: string, file: Blob) => Promise<string>) | null;
} {
  const createTicket = useLiveMutation(api.receipts.createUploadTicket);
  const generateUrl = useLiveMutation(api.receipts.generateUploadUrl);
  const finalize = useLiveMutation(api.receipts.finalizeUpload);

  const upload = useCallback(
    async (tabId: string, file: Blob) => {
      if (!createTicket || !generateUrl || !finalize) {
        throw new Error(RECEIPT_UPLOAD_UNAVAILABLE);
      }

      const ticket = await createTicket({ tabId: tabId as Id<"tabs"> });
      const uploadUrl = await generateUrl({
        importId: ticket.importId,
        uploadTicketHash: ticket.uploadTicketHash,
      });
      const storageId = await postReceiptBlob(uploadUrl, file);
      await finalize({
        importId: ticket.importId,
        uploadTicketHash: ticket.uploadTicketHash,
        storageId,
      });
      return ticket.importId as string;
    },
    [createTicket, generateUrl, finalize],
  );

  if (!createTicket || !generateUrl || !finalize) {
    return { upload: null };
  }

  return { upload };
}
