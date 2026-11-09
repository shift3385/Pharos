// The images a requirement came from (IA-19): «Requisitos desde diseños»
// keeps them, when the user ticks it, as attachments of each requirement
// (evidence store, ADR-0014; `requirement_attachments.rs`). Desktop only:
// the web keeps no evidence (SYNC-04b), so there the list is empty.
import type { Contract } from "@shared/contracts";
import { invoke, isTauri } from "@shared/platform";

export type RequirementAttachment = Contract.RequirementAttachment;

const UPLOAD_CHUNK = 4 * 1024 * 1024;

async function upload(file: Blob): Promise<string> {
  const uploadId = await invoke<string>("evidence_upload_begin", {
    size: file.size,
  });
  try {
    for (let offset = 0; offset < file.size; offset += UPLOAD_CHUNK) {
      const chunk = new Uint8Array(
        await file.slice(offset, offset + UPLOAD_CHUNK).arrayBuffer(),
      );
      await invoke("evidence_upload_chunk", chunk, {
        headers: { "x-pharos-upload": uploadId },
      });
    }
  } catch (e) {
    await invoke("evidence_upload_cancel", { uploadId }).catch(() => undefined);
    throw e;
  }
  return uploadId;
}

/** A base64 image (as sent to the AI) as a Blob. */
export function imageBlob(mediaType: string, base64: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mediaType });
}

export const requirementAttachments = {
  /** Whether this platform can keep the images (the desktop). */
  available: (): boolean => isTauri(),
  add: async (
    requirementId: string,
    userId: string,
    name: string,
    file: Blob,
  ): Promise<RequirementAttachment | null> => {
    if (!isTauri()) return null;
    const uploadId = await upload(file);
    return invoke("requirement_attachment_add", {
      requirementId,
      userId,
      uploadId,
      name,
      mime: file.type || null,
    });
  },
  list: (
    requirementId: string,
    userId: string,
  ): Promise<RequirementAttachment[]> =>
    isTauri()
      ? invoke("requirement_attachment_list", { requirementId, userId })
      : Promise.resolve([]),
  /** A `data:` URL of the image, or null (not an image, or not here). */
  preview: (id: string, userId: string): Promise<string | null> =>
    isTauri()
      ? invoke("requirement_attachment_preview", { id, userId })
      : Promise.resolve(null),
};
