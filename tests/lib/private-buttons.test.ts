import { describe, expect, it } from "vitest";
import { resolvePrivateButton } from "@/lib/telegram/privateButtons";
import {
  START_TAB_BUTTON_LABEL,
  WHAT_I_OWE_BUTTON_LABEL,
} from "@/lib/telegram/privateMessages";

const base = {
  miniAppLink: "https://t.me/mytabbot/app",
  startGroupUrl: "https://t.me/mytabbot?startgroup=true",
  buildDeepLink: (token: string) => `https://t.me/mytabbot/app?startapp=${token}`,
};

describe("private-chat Mini App doors", () => {
  it("opens /tabs/new and /owe via web_app when an HTTPS origin is set", () => {
    const start = resolvePrivateButton("start_tab", {
      ...base,
      httpsOrigin: "https://app.example.com",
    });
    const owe = resolvePrivateButton("what_i_owe", {
      ...base,
      httpsOrigin: "https://app.example.com",
    });
    expect(start).toEqual({
      text: START_TAB_BUTTON_LABEL,
      web_app: { url: "https://app.example.com/tabs/new" },
    });
    expect(owe).toEqual({
      text: WHAT_I_OWE_BUTTON_LABEL,
      web_app: { url: "https://app.example.com/owe" },
    });
  });

  it("falls back to reserved startapp params without an HTTPS origin", () => {
    const start = resolvePrivateButton("start_tab", { ...base, httpsOrigin: null });
    const owe = resolvePrivateButton("what_i_owe", { ...base, httpsOrigin: null });
    expect(start).toEqual({
      text: START_TAB_BUTTON_LABEL,
      url: "https://t.me/mytabbot/app?startapp=tab",
    });
    expect(owe).toEqual({
      text: WHAT_I_OWE_BUTTON_LABEL,
      url: "https://t.me/mytabbot/app?startapp=owe",
    });
  });
});
