import { describe, expect, it } from "vitest";
import {
  clipTelegramPhotoCaption,
  TELEGRAM_PHOTO_CAPTION_MAX,
} from "../../lib/telegram/caption";

describe("clipTelegramPhotoCaption", () => {
  it("leaves a short caption untouched", () => {
    expect(clipTelegramPhotoCaption("Tab is open")).toBe("Tab is open");
  });

  it("clips to the Bot API photo-caption cap", () => {
    const long = "x".repeat(TELEGRAM_PHOTO_CAPTION_MAX + 40);
    const clipped = clipTelegramPhotoCaption(long);
    expect(clipped.length).toBe(TELEGRAM_PHOTO_CAPTION_MAX);
    expect(clipped.startsWith("x")).toBe(true);
  });
});
