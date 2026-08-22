import { describe, expect, it } from "vitest";
import {
  extractPhotoFileId,
  HOUSE_TAB_CARD_PATH,
  houseTabCardUrl,
} from "../../lib/telegram/tabCard";

describe("houseTabCardUrl", () => {
  it("joins the Mini App origin to the house still", () => {
    expect(houseTabCardUrl("https://app.example.com/")).toBe(
      `https://app.example.com${HOUSE_TAB_CARD_PATH}`,
    );
  });

  it("is absent when the Mini App origin is missing", () => {
    expect(houseTabCardUrl(null)).toBeUndefined();
  });
});

describe("extractPhotoFileId", () => {
  it("picks the largest Telegram photo size", () => {
    expect(
      extractPhotoFileId({
        photo: [
          { file_id: "small", width: 90, height: 67 },
          { file_id: "large", width: 1280, height: 960 },
          { file_id: "mid", width: 320, height: 240 },
        ],
      }),
    ).toBe("large");
  });

  it("returns nothing when Telegram sent no photo", () => {
    expect(extractPhotoFileId({})).toBeUndefined();
    expect(extractPhotoFileId({ photo: [] })).toBeUndefined();
  });
});
