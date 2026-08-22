/** Public path of the house-style tab-card still (U-8). */
export const HOUSE_TAB_CARD_PATH = "/tab-card/house.webp";

export function houseTabCardUrl(miniAppOrigin: string | null): string | undefined {
  if (!miniAppOrigin) {
    return undefined;
  }
  return `${miniAppOrigin.replace(/\/$/, "")}${HOUSE_TAB_CARD_PATH}`;
}

export function extractPhotoFileId(message: {
  photo?: ReadonlyArray<{ file_id?: string; width?: number; height?: number }>;
}): string | undefined {
  const sizes = message.photo;
  if (!sizes || sizes.length === 0) {
    return undefined;
  }
  const largest = [...sizes].sort(
    (a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0),
  )[0];
  const id = largest?.file_id?.trim();
  return id && id.length > 0 ? id : undefined;
}
