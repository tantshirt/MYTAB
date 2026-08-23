export const INVITE_COPY = {
  panelAlone: "Nobody else is here yet. Send the link and they can start claiming while you finish.",
  sendTheLink: "Send the link",
  sendToSomeoneElse: "Send to someone else",
  sentSeats: (seats: number) => `Sent. ${seats} ${seats === 1 ? "seat" : "seats"} left.`,
  seatsLeft: (seats: number) => `${seats} ${seats === 1 ? "seat" : "seats"} left`,
  copyLink: "Copy link",
  copied: "Copied",
  copyFailed: "Couldn't copy. Long-press to select.",
  addSomeone: "Add someone",
  sheetTitle: "Invite",
  /*
   * The handoff is the moment the tab is born and five people are sitting
   * around it. The code is the hero and the instruction is what someone reads
   * out loud, so it has to survive being said across a loud table.
   */
  handoffTitle: "Get everyone in",
  handoffInstruction: "Point your camera at this. It opens the tab on your phone.",
  handoffAside: "Not at the table? Copy the link and send it.",
  showQr: "Show the code",
  hideQr: "Hide the code",
  qrLabel: "Invite code",
  stopLink: "Stop this link",
  stopped: "This link no longer works.",
  shareUnavailable: "Sharing isn't available here. Copy the link instead.",
} as const;
