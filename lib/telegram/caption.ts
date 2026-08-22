/**
 * Telegram photo captions cap at 1024 characters. Text messages cap at 4096.
 * D-31 switches the status card to sendPhoto / editMessageCaption when a
 * photo exists, so every renderer must fit the caption budget.
 *
 * Generation of that photo is blocked on U-8. This helper is the plumbing
 * only: clip, never invent an image.
 */

export const TELEGRAM_PHOTO_CAPTION_MAX = 1024;
export const TELEGRAM_MESSAGE_TEXT_MAX = 4096;

/** Clips caption text to the Bot API photo-caption limit. Never blank a figure. */
export function clipTelegramPhotoCaption(text: string): string {
  if (text.length <= TELEGRAM_PHOTO_CAPTION_MAX) {
    return text;
  }
  return text.slice(0, TELEGRAM_PHOTO_CAPTION_MAX);
}
