"use client";

import { useCallback } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLiveMutation } from "@/features/convex/useConvexData";

export const RECEIPT_UPLOAD_UNAVAILABLE = "RECEIPT_UPLOAD_UNAVAILABLE";
export const RECEIPT_UPLOAD_FAILED = "RECEIPT_UPLOAD_FAILED";
const RECEIPT_PAGE_MAX_BYTES = 8 * 1024 * 1024;
const RECEIPT_TOTAL_MAX_BYTES = 32 * 1024 * 1024;
const RECEIPT_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function finalizeReceiptUploadWithExactReplay<T>(
  finalize: () => Promise<T>,
): Promise<T> {
  try {
    return await finalize();
  } catch {
    // The first response may have been lost after the mutation committed.
    return finalize();
  }
}

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
  upload: ((tabId: string, files: readonly Blob[]) => Promise<string>) | null;
} {
  const createTicket = useLiveMutation(api.receipts.createUploadTicket);
  const generateUrl = useLiveMutation(api.receipts.generateUploadUrl);
  const registerPage = useLiveMutation(api.receipts.registerUploadPage);
  const discardCandidate = useLiveMutation(api.receipts.discardUploadCandidate);
  const finalize = useLiveMutation(api.receipts.finalizeUpload);
  const discard = useLiveMutation(api.receipts.discardUpload);

  const upload = useCallback(
    async (tabId: string, files: readonly Blob[]) => {
      if (!createTicket || !generateUrl || !registerPage || !discardCandidate || !finalize || !discard) {
        throw new Error(RECEIPT_UPLOAD_UNAVAILABLE);
      }
      if (files.length === 0 || files.length > 8) {
        throw new Error(files.length > 8 ? "RECEIPT_PAGE_LIMIT_EXCEEDED" : RECEIPT_UPLOAD_FAILED);
      }
      let totalBytes = 0;
      for (const file of files) {
        if (!RECEIPT_IMAGE_MIME_TYPES.has(file.type)) {
          throw new Error("RECEIPT_IMAGE_TYPE_UNSUPPORTED");
        }
        totalBytes += file.size;
        if (file.size > RECEIPT_PAGE_MAX_BYTES || totalBytes > RECEIPT_TOTAL_MAX_BYTES) {
          throw new Error("RECEIPT_IMAGE_TOO_LARGE");
        }
      }

      const ticket = await createTicket({ tabId: tabId as Id<"tabs"> });
      const registeredStorageIds: Id<"_storage">[] = [];
      let finalizationStarted = false;
      try {
        for (const file of files) {
          const uploadUrl = await generateUrl({
            importId: ticket.importId,
            uploadTicketHash: ticket.uploadTicketHash,
          });
          const storageId = await postReceiptBlob(uploadUrl, file);
          try {
            await registerPage({
              importId: ticket.importId,
              uploadTicketHash: ticket.uploadTicketHash,
              storageId,
            });
            registeredStorageIds.push(storageId);
          } catch (error) {
            await discardCandidate({
              importId: ticket.importId,
              uploadTicketHash: ticket.uploadTicketHash,
              storageId,
            }).catch(() => undefined);
            throw error;
          }
        }
        const finalizeArgs = {
          importId: ticket.importId,
          uploadTicketHash: ticket.uploadTicketHash,
          storageIds: registeredStorageIds,
        };
        finalizationStarted = true;
        await finalizeReceiptUploadWithExactReplay(() => finalize(finalizeArgs));
      } catch (error) {
        if (!finalizationStarted) {
          await discard({
            importId: ticket.importId,
            uploadTicketHash: ticket.uploadTicketHash,
          }).catch(() => undefined);
        }
        throw error;
      }
      return ticket.importId as string;
    },
    [createTicket, discard, discardCandidate, finalize, generateUrl, registerPage],
  );

  if (!createTicket || !generateUrl || !registerPage || !discardCandidate || !finalize || !discard) {
    return { upload: null };
  }

  return { upload };
}
