/** Public path of the house-style tab-card still (U-8). */
export const HOUSE_TAB_CARD_PATH = "/tab-card/house.webp";

/**
 * The welcome still — same house style, a different moment: the bill has just
 * landed on a table people are still talking at.
 *
 * Deliberately NOT the tab-card file. That one is edited over and over across
 * one dinner, which is why D-31 reuses its `file_id`; the welcome fires once
 * per person, so it is sent by URL and needs no stored id and no schema row.
 */
export const HOUSE_WELCOME_PATH = "/welcome/welcome.webp";

function houseStillUrl(miniAppOrigin: string | null, path: string): string | undefined {
  if (!miniAppOrigin) {
    return undefined;
  }
  return `${miniAppOrigin.replace(/\/$/, "")}${path}`;
}

export function houseTabCardUrl(miniAppOrigin: string | null): string | undefined {
  return houseStillUrl(miniAppOrigin, HOUSE_TAB_CARD_PATH);
}

export function houseWelcomeUrl(miniAppOrigin: string | null): string | undefined {
  return houseStillUrl(miniAppOrigin, HOUSE_WELCOME_PATH);
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
