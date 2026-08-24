/**
 * What we register with Telegram: scoped command menus and the Menu button.
 *
 * `/splitbill` is routed (Story 2.5 AC1) but not listed — registered is not
 * the same as listed (INVITE-FLOW §2.2).
 */

import type { TelegramBotCommand, TelegramMenuButton } from "./api";

export const MENU_BUTTON_LABEL = "Open My Tab";

export const PRIVATE_BOT_COMMANDS: readonly TelegramBotCommand[] = [
  { command: "tab", description: "Start a tab" },
  { command: "balance", description: "Where you stand" },
  { command: "help", description: "What My Tab does" },
];

export const GROUP_BOT_COMMANDS: readonly TelegramBotCommand[] = [
  { command: "tab", description: "Start a tab for this group" },
  { command: "balance", description: "Where you stand" },
];

export function menuButtonForMiniApp(miniAppHttpsUrl: string): TelegramMenuButton {
  return {
    type: "web_app",
    text: MENU_BUTTON_LABEL,
    web_app: { url: miniAppHttpsUrl },
  };
}
