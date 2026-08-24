/**
 * Resolves private-chat keyboard buttons to a Mini App surface.
 *
 * `web_app` needs an HTTPS origin. Without one, fall back to t.me with a
 * reserved start param so the Mini App still opens the right door.
 */

import {
  ADD_TO_GROUP_BUTTON_LABEL,
  OPEN_MY_TAB_BUTTON_LABEL,
  OPEN_TAB_BUTTON_LABEL,
  START_TAB_BUTTON_LABEL,
  WHAT_I_OWE_BUTTON_LABEL,
  type PrivateButtonKind,
} from "./privateMessages";

export type PrivateButtonTarget =
  | { text: string; web_app: { url: string } }
  | { text: string; url: string };

export type ResolvePrivateButtonInput = {
  httpsOrigin: string | null;
  miniAppLink: string;
  startGroupUrl: string;
  openTabToken?: string;
  buildDeepLink: (token: string) => string;
};

function miniAppDoor(
  label: string,
  input: ResolvePrivateButtonInput,
  path: string,
  startapp?: string,
): PrivateButtonTarget {
  if (input.httpsOrigin) {
    return { text: label, web_app: { url: `${input.httpsOrigin}${path}` } };
  }
  const url = startapp
    ? `${input.miniAppLink}?startapp=${encodeURIComponent(startapp)}`
    : input.miniAppLink;
  return { text: label, url };
}

export function resolvePrivateButton(
  kind: PrivateButtonKind,
  input: ResolvePrivateButtonInput,
): PrivateButtonTarget {
  switch (kind) {
    case "start_tab":
      return miniAppDoor(START_TAB_BUTTON_LABEL, input, "/tabs/new", "tab");
    case "what_i_owe":
      /*
       * `/owe`, not `/you`. The button asks a money question and `/you` is
       * identity and wallet settings — landing there answered a question
       * nobody asked, and buried the answer they wanted.
       */
      return miniAppDoor(WHAT_I_OWE_BUTTON_LABEL, input, "/owe", "owe");
    case "add_to_group":
      return { text: ADD_TO_GROUP_BUTTON_LABEL, url: input.startGroupUrl };
    case "open_tab":
      return {
        text: OPEN_TAB_BUTTON_LABEL,
        url: input.openTabToken
          ? input.buildDeepLink(input.openTabToken)
          : input.miniAppLink,
      };
    case "open_my_tab":
      return miniAppDoor(OPEN_MY_TAB_BUTTON_LABEL, input, "/");
  }
}
