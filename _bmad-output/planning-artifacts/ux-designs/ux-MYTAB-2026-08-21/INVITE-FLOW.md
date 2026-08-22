---
name: My Tab — Invite Flow
status: final
created: '2026-08-22'
sources:
  - ./EXPERIENCE.md
  - ./DESIGN.md
  - ../../briefs/brief-MYTAB-2026-08-21/brief.md
  - ../../prds/prd-MYTAB-2026-08-21/prd.md
  - ../../epics.md
companion: ./EXPERIENCE.md
amends:
  - brief §1 decision 2
  - brief §1 decision 4 / §2.8
  - EXPERIENCE.md Foundation, Information Architecture, State Patterns, The Telegram Surface, Interaction Primitives
  - epics.md Story 2.5, Story 2.6, Story 8.6
blocks_mainnet:
  - see §9.11 — nine ingress-path items that must not ship
---

# My Tab — The Invite Flow

Everything before the Claim Board.

`EXPERIENCE.md` remains the behavioral authority for everything from the Claim Board
onward and is unchanged by this document except where §9 lists a specific amendment.
`DESIGN.md` remains the visual authority. Where this document and `EXPERIENCE.md`
disagree on ingress, this document wins; everywhere else `EXPERIENCE.md` wins.

This ships to mainnet. There is no demo affordance, no sample data, and no fixture path
anywhere in this document (see §9.7).

---

## 0. The gap, stated once

Every existing artifact begins at *"the organizer types `/tab` in a Telegram group where
our bot is already an admin."* Nothing describes how anyone reaches that sentence.

The current code says it more bluntly than any spec does. In
`/Users/dre/Desktop/MYTAB/lib/telegram/webhook.ts`:

```ts
function normalizeMessageUpdate(updateId, message) {
  const chat = parseChat(message.chat);
  const from = parseUser(message.from);
  if (!chat || !from || from.is_bot) return null;
  if (!isGroupChat(chat)) return null;   // ← every private message is dropped
```

A person who finds My Tab in Telegram search, opens it, and types `/start` gets
**silence**. Not an error — silence. That is the product's entire front door today.

Behind it, the schema enforces the same assumption: `tabs.groupId` is a required
`v.id("groups")`, and `groups.telegramChatId` is a required string. **A tab cannot exist
without a Telegram group chat.** The gap is not a missing screen; it is a structural
precondition that four onboarding steps exist before anyone splits anything:

> find the bot → add it to a group → promote it to administrator → type `/tab`

This document removes three of those four and makes the fourth optional.

---

## 1. The membership model

### 1.1 The resolution, in one sentence

> **`getChatMember` authorizes speaking to a group. `tabParticipants` authorizes acting
> on a bill. These were conflated. They are now separate.**

There are **not** two membership models. There is one roster with two doors.

### 1.2 What binding decision 2 actually buys

Binding decision 2 requires the bot to be a group administrator and treats live
`getChatMember` as the source of truth. The security instinct is correct. The *unit* is
wrong.

`getChatMember` proves exactly one fact: *this person is currently in that Telegram
chat.* It is used as a proxy for the question the product actually cares about: *was this
person at the dinner?*

It is a loose proxy in both directions:

- Maya's group chat has twelve people. Five were at dinner. Today, all twelve can open
  the tab and write to a five-person bill.
- Maya's colleague was at the table and is not in the chat. Today she cannot be on the
  bill at all.

So the group-membership check is not a tight fence around the bill. `tabParticipants` is,
and the code already knows this — `requireTabParticipant` in
`/Users/dre/Desktop/MYTAB/convex/lib/tabAuth.ts` is what every claim, release, lock,
review, and settle already passes through. Binding decision 2 guards the *door*;
`tabParticipants` guards the *room*.

### 1.3 One roster, two doors

**The authoritative membership object is `tabParticipants`.** Every write on a tab is
authorized against a `tabParticipants` row, plus a live Privy identity, plus a fresh
five-minute server-side Telegram context. That is unchanged and non-negotiable.

Two doors write into that roster:

| | **Door A — Group** (`origin: "chat"`) | **Door B — Invite** (`origin: "personal"`) |
|---|---|---|
| Started by | `/tab` in a group where the bot is present | "Start a tab" in the Mini App, from anywhere |
| Roster bound | the Telegram chat's own membership | a **seat count** the organizer set |
| Admission proof | verified `initData` + matching chat scope + live `getChatMember` | verified `initData` + Privy identity + an unconsumed seat on an active token |
| Bot may post to a chat | **yes** — gated on `botIsAdmin` and live membership, exactly as decision 2 says | **structurally impossible** (§1.7) |
| Row written | `tabParticipants` | `tabParticipants` |

**Both doors produce the identical row.** Nothing downstream branches on how a person got
in. That is the load-bearing beam of the security argument: there is no second permission
system to get wrong, no second code path to forget to patch, and no "link mode" capability
matrix that can drift from the real one.

### 1.4 What an invite-door participant may do

Exactly what a group-door participant may do. The capability line is drawn by **role**,
not by **door**:

| Capability | Participant | Organizer |
|---|---|---|
| See the item list and prices | yes | yes |
| See who claimed what (avatar stacks, presence) | yes | yes |
| Claim / release their own items | yes | yes |
| See their own exact share | yes | yes |
| **See every other person's exact share** (Bill Review) | **yes** | yes |
| Settle their own share | yes | yes |
| Tip | yes | yes |
| Edit items, adjustments, receipt | no | yes |
| Lock / reopen | no | yes |
| **Enlarge the tab (invite, add seats)** | **no** | **yes** |
| Remove a participant who has claimed nothing | no | yes |
| Cause a message in a group chat | no | only via §6 |

Two of these are deliberate calls that need defending.

**Bill Review stays open to invite-door participants.** `EXPERIENCE.md`, *Money
Legibility*, already resolved this for everyone: *"Everyone can inspect everyone's share.
A split people cannot audit is a split people argue about."* NFR-7's actual sentence is
*"No personal bill detail in public group confirmations"* — its subject is the **group
chat message**, not the app. The Claim Board has always shown other people's claims; the
presence stack is the whole point. An invite-door participant sees what a group-door
participant sees because **it is the same room, entered by a different door**. Making link
people second-class readers would produce a bill where some people can check the maths and
some cannot, which is the exact failure the product exists to prevent.

**Only the organizer may invite.** This is the security line for invite mode, and it is
the answer to "someone forwards it to a person who wasn't at dinner." The invariant:

> **The number of people who can enlarge a tab is exactly one, and it is the person who is
> owed the money.**

Maya fronted the bill. She is the only person with an economic interest in the roster
being right, and the only person who knows who was at the table. Telegram enforces half of
this for free: `savePreparedInlineMessage` binds the prepared message to **one**
`user_id`, so only Maya can send it from her share sheet. A participant cannot re-share
from inside the app at all.

### 1.5 Seats — the bound that replaces `getChatMember`

A `tab_session` token is reusable for 24 hours (`TAB_SESSION_TTL_MS` in
`/Users/dre/Desktop/MYTAB/convex/lib/sessionTokenSync.ts`) and binding decision 4 is right
that a revisit must never be rejected merely because someone else used the link. In group
mode that is safe because the chat roster bounds it. In invite mode there is no chat, so
**the token must carry its own bound.**

**Every tab has a seat policy.**

```
seatPolicy:
  | { kind: "chat" }              // group-origin: bounded by the Telegram chat itself
  | { kind: "fixed", seats: n }   // invite-origin: bounded by the head count
```

For `fixed`:

- Each **new** Telegram user id admitted consumes one seat and gets a `tabParticipants`
  row. The decrement is a single transactional read-modify-write on the token row.
- A user id **already on the roster** consumes nothing and re-enters freely, forever
  (§1.6). Binding decision 4's revisit rule is preserved and strengthened.
- When seats reach zero the link admits nobody new. It still opens, and shows group facts
  only — tab name and people count — which is strictly less than the bot's own
  `tab_opened` card would have posted in a chat. **Nothing leaks that a group message
  would not have leaked.** That is the complete NFR-7 argument for the forwarded link.
- The organizer can add a seat at any time, from the Claim Board, in one tap.
- Seats can never be lowered below the number of people already on the tab.

Seats are not a technical fence pretending to be a policy. They are the social fact made
literal: *five people ate, so five people get in.* A sixth person hitting the wall reads a
statement about the dinner, not a security error.

Two properties make this hold in practice:

- **Claiming is what makes you count.** A curious forward-recipient who opens and claims
  nothing changes no arithmetic, appears in no breakdown, and can be removed by the
  organizer with the seat returned.
- **There is no anonymous entry.** Admission requires a verified Telegram identity, and
  that identity is visible by name and avatar to everyone at the table, live. That is the
  same deterrent a group chat provides, applied to a smaller and more accurate set.

### 1.6 The token admits; the roster authorizes

This is the single most important implementation rule in this document, and it is why the
resolution order in §5.2 checks the roster *before* it checks the token.

- An **expired** token still lets an existing participant in. Their membership is the
  `tabParticipants` row, not the link.
- A **revoked** token still lets an existing participant in. Revocation stops recruitment,
  not attendance.
- A **full** tab still lets an existing participant in.
- A **locked** tab still lets an existing participant in — they have money to settle.

A link is a doorbell. Once you are inside, the doorbell is irrelevant.

### 1.7 Why an invite tab structurally cannot spam a chat

An invite-origin tab hangs off a `groups` row of `kind: "personal"` whose
`telegramChatId` is the organizer's own private chat with the bot. For such a group:

- `telegramStatusMessages` is **never** created. The status publisher keys off that table,
  so there is no row to lease, no `chatId` to post to, and no code path that can reach
  `sendMessage`.
- `assertPrivilegedActionAllowed` is **never** called, and asserts a developer error if it
  ever is. `botIsAdmin` is stored `false` and is meaningless.

The guarantee is structural, not a runtime check that someone can forget. The five-event
rule is intact because there is no chat to send a sixth event to.

**Explicitly rejected:** posting the status card into the organizer's own DM as a
"your tab" anchor. It is private and would leak nothing, but `EXPERIENCE.md` bans
notification pressure and the bot's private chat is reactive-only (§3.4). Her tab lives in
the app.

### 1.8 The security argument, closed

The change is a **narrowing**, not a loosening:

| | Before | After |
|---|---|---|
| Who may write to a five-person bill | all twelve chat members | the five people on the roster |
| Who may enlarge the roster | anyone who can forward a link into the chat | the organizer only |
| What proves identity | Privy JWT + verified `initData` | unchanged |
| What proves the active session | five-minute server-side Telegram context | unchanged |
| What a group chat ever learns | group facts only | unchanged |
| What a forwarded link exposes to a stranger | *(previously impossible — no link existed)* | tab name and people count, less than the bot's own card |
| Bot administrator required to split a bill | yes | no — required only to post into a chat |

Real money moves at the end of this. The things that guard the money are unchanged: the
recipient is server-owned and never client-supplied; the obligation is computed from a
locked snapshot; settlement passes `requireTabParticipant`; sponsorship caps and
allowlists are untouched. Nothing in this document sits between a person and their own
money, and nothing in it lets one person move another person's.

### 1.9 What the group door enforces today, versus what it claims

Binding decision 2 describes a live membership check. The Mini App join path does not
currently perform one, and this matters for §9.1: the amendment below **tightens** the
group door rather than trading it away.

Two facts from the current code:

1. **`resolveTabSession` calls `requireGroupMember`, which is a pure cache read.**
   `/Users/dre/Desktop/MYTAB/convex/lib/auth.ts` reads a `groupMembers` row, checks
   `membershipStatus === "active"`, and returns. It never inspects `verifiedAt` and never
   calls Telegram. `assertPrivilegedActionAllowed` — the gate that *does* enforce
   freshness and `botIsAdmin` — runs only on the **bot-command** path (`/tab`, `/tip`,
   `/balance`), never on the Mini App join.
2. **`groupMembers` rows are written `active` from unverified webhook payloads.**
   `resolveGroupFromChat` in `/Users/dre/Desktop/MYTAB/convex/lib/groupSync.ts` upserts any
   message sender as `role: "member", membershipStatus: "active",
   verificationSource: "webhook"`. Posting once in the chat is enough to become a member
   forever, with no expiry and no re-proof.

So today, joining a tab through the group door requires: a valid token, a Privy identity,
and a cached row that may have been written months ago by a person who has since left.
That is materially weaker than the invite door proposed here, which requires an
organizer-minted token, an unconsumed seat, and a verified identity checked at the moment
of entry.

This document does not exploit that gap; it closes it. §9.1's amendment 2a requires
`resolveTabSession` on a **chat-origin** tab to run `assertPrivilegedActionAllowed` —
the live `getChatMember` refresh decision 2 already mandates — at step 6 of the resolution
order in §5.6. That is a **new** enforcement point, and it is the reason this design can
claim to be a narrowing rather than a trade.

---

## 2. First contact

### 2.1 Every real entry, ranked by expected volume

| # | Entry | Lands on | Section |
|---|---|---|---|
| 1 | A friend sends the link (invite message) | Claim Board, scoped | §5 |
| 2 | A group where the bot already lives — the `[Open tab]` card | Claim Board, scoped | unchanged, §5 |
| 3 | Telegram search / Mini App catalogue → bot profile → Start | bot DM | §2.2, §3 |
| 4 | Someone taps the bot's name from a forwarded card | bot DM | §2.2, §3 |
| 5 | The Mini App's menu button, from an existing chat with the bot | Tabs (returning) or First Screen | §2.4 |
| 6 | A group member types `/tab` | group card | unchanged |
| 7 | The Mini App URL pasted into a browser | read-only web summary | §7 row 16 |

### 2.2 The bot's profile — exact strings

None of these are set anywhere in the repo today. `scripts/setup-telegram.mjs` configures
the webhook and the Convex environment and then hands the rest to a manual BotFather
checklist that does not mention any of them. These are product copy and belong here.

**Name** — `/setname`

```
My Tab
```

**About text** — `/setabouttext`, 120 char ceiling, shown on the bot's profile card.

```
The group tab that lives in Telegram. Split a bill, everyone claims their own, settle up. No app to install.
```

**Description** — `/setdescription`, 512 char ceiling. This is the large block a person
reads on the empty chat screen, above Telegram's own **Start** button. It is the first
sentence of the product most people will ever read.

```
Split a restaurant bill with the people who were actually there.

Photograph the receipt. Everyone taps what they ordered, on their own phone, at the same time. My Tab works out each person's exact share — items, service, tax, tip, down to the last satang — and everyone pays their part back to whoever fronted it.

Nothing to install. Nothing to sign up for.
```

**Description picture** — none. A static image would have to be either a screenshot
(stale within a sprint) or a marketing frame (`PRODUCT.md`: the marketing story is not
built here). Leave it unset.

**Menu button** — `/setmenubutton`

```
Open My Tab      →  the Mini App, no start parameter
```

**Commands** — `/setcommands`, **scoped**. Telegram supports per-scope command menus and
the two scopes should not be identical.

Scope `all_private_chats`:

```
tab - Start a tab
balance - Where you stand
tip - Send someone a tip
help - What My Tab does
```

Scope `all_group_chats`:

```
tab - Start a tab for this group
balance - Where you stand
tip - Send someone a tip
```

`/splitbill` remains **registered and routed** (Story 2.5 AC1) but is **not listed** in
either menu. It exists so that a person who types it gets the right behavior; it does not
exist to occupy a slot in a four-item menu. Registered is not the same as listed, and the
epic's acceptance criterion is satisfied by routing.

### 2.3 `/start` — the very first bot message

Sent on Telegram's own **Start** button and on any bare `/start`.

```
Hi — I'm My Tab.

I split a restaurant bill so everyone pays their own part. You photograph
the receipt, your friends tap what they ordered, and each share comes out
exact.

Start a tab and I'll give you a link to send them.
```

Inline keyboard, two rows:

```
[ Start a tab ]            web_app button → Mini App, no start parameter
[ Add me to a group ]      url button → https://t.me/<bot>?startgroup=true
```

Two mechanical notes an engineer would otherwise have to guess:

- `web_app` inline buttons are permitted **only in private chats**. In a group the bot
  must use a `url` button to the deep link — which is what `singleButtonKeyboard` in
  `/Users/dre/Desktop/MYTAB/lib/telegram/api.ts` already does. Do not unify these.
- **"Add me to a group" is second, and it is optional.** That ordering is the friction
  removal. Nothing in the sentence above implies a group is required, because it is not.

### 2.4 The very first screen in the app

Cold open, authenticated, no start parameter, no tabs, no groups.

`EXPERIENCE.md` currently specifies for this exact state: *"No tabs yet. Start one from any
Telegram group."* with a "Start a tab" button that, per the same document, *"explains
'Open My Tab from a Telegram group to start a tab' and opens the bot."* That is a button
that opens a bot that tells you to go somewhere else. It is the dead end, and it is
replaced.

```
┌──────────────────────────────────────────┐
│                                          │
│                                          │
│            [ lockup ]                    │
│                                          │
│                                          │
│         Split a bill with                │   title, {colors.ink}
│         the people who                   │
│         were there.                      │
│                                          │
│                                          │
│   ┌──────────────────────────────────┐   │
│   │          Start a tab             │   │   52px, {colors.primary}
│   └──────────────────────────────────┘   │
│                                          │
│      Someone sent you a link?            │   meta, {colors.ink-muted}
│      Open it from the chat.              │
│                                          │
└──────────────────────────────────────────┘
```

- Sits directly on `{colors.paper}`. No card, no illustration, no carousel.
- Replaces the Launch state in place once authentication resolves. If authentication is
  still resolving, the Launch state (*"Getting your tab ready…"*) holds — unchanged.
- No sign-up, no "connect wallet", no group requirement, no permission request.
- Bottom tab bar **is** shown here (this is a cold open, Story 2.6 AC3), but Activity and
  You are empty states, which is correct and honest.
- A **returning** person with tabs never sees this screen — they land on Tabs.

---

## 3. The pre-Mini-App chat

*The product owner's explicit gap: "how the chat window and how they can interact with the
chat before opening the mini app."*

### 3.1 The governing rule

The bot's private chat is **reactive-only and minimal**. It answers what a person typed
and then goes quiet. It never initiates, never reminds, never nudges, never reports a
balance, and never posts unprompted. `EXPERIENCE.md`'s ban on notification pressure applies
in a DM exactly as it applies in a group.

But it must not be a dead end. Every reply carries a way forward.

### 3.2 Private-chat command table

| Typed | Reply text | Buttons |
|---|---|---|
| `/start` | §2.3 | `[ Start a tab ]` `[ Add me to a group ]` |
| `/start <token>` | `🍜 Sukhumvit Dinner` <br> `Maya started a tab. Tap to claim what you ordered.` | `[ Open tab ]` → deep link |
| `/tab`, `/splitbill` | `Let's do it.` | `[ Start a tab ]` |
| `/tip` | `Who are you tipping?` | `[ Send a tip ]` |
| `/balance` | `Open My Tab to see where you stand.` | `[ Open My Tab ]` |
| `/help` | §3.3 | `[ Start a tab ]` |
| anything else | §3.4 | `[ Start a tab ]` |

**`/balance` never states an amount in chat.** Story 2.5 AC3 already requires this for
groups; it holds in a DM too. A chat message is screenshot-able and forwardable, and one
copy vocabulary is worth more than saving a person one tap.

**`/start <token>`** is the recovery path for a link that reached the DM instead of the
Mini App — an old-format link, a paste, a `?start=` where a `?startapp=` was meant. Rather
than dying, it hands back the invite card with a working button. Cheap, and it makes a
whole class of link mistakes survivable.

### 3.3 `/help`

```
My Tab splits a restaurant bill.

Start a tab, photograph the receipt, and send the link to whoever was
there. Everyone taps what they ordered on their own phone. Each share
comes out exact — items, service, tax, tip, to the satang — and everyone
pays their part back to whoever fronted it.

/tab — start a tab
/balance — where you stand
/tip — send someone a tip
```

### 3.4 When the bot does not understand

```
I only do one thing, and it's bills.

Start a tab and I'll give you a link to send your friends.
```

`[ Start a tab ]`

Three rules on the fallback:

1. **Private chats only.** The bot never replies to plain text in a group. Only to its own
   commands. A bot that answers chatter is the reason a group mutes it.
2. **Rate-limited to one reply per person per 60 seconds.** Someone pasting a paragraph
   gets one reply, not five.
3. **Never a scold.** No "unknown command", no "I didn't understand that", no command list
   dumped as a correction. It states what the bot is and offers the door.

### 3.5 The bot is added to a group

On `my_chat_member` showing the bot has joined a group, the bot posts **once**, and never
again for that chat.

With administrator rights:

```
Thanks for the add. Type /tab when the bill lands and I'll set it up.
```

Without administrator rights:

```
Thanks for the add. Type /tab when the bill lands.

One thing: make me an admin here and I can keep one live card in the chat
as people settle. Without it, tabs still work — I just can't post.
```

This message is the honest statement of the new model: **administrator status is an
enhancement, not a gate.**

### 3.6 Webhook changes required

`allowed_updates` in `scripts/setup-telegram.mjs` needs **no change** —
`["message", "chat_member", "my_chat_member"]` already delivers private messages, because
a private `/start` arrives as a `message` update. The only change is in
`normalizeMessageUpdate`:

- Stop returning `null` for non-group chats. Carry `chatType` through the normalized
  update.
- Route private-chat commands to a new reply handler; route group-chat commands to the
  existing one, unchanged.
- Continue to drop `from.is_bot`, and continue to ignore non-command text in groups.
- Private-chat replies are **not** status events. `TELEGRAM_POSTING_EVENTS` is untouched
  (see the amendment in §9.6).

---

## 4. Creating a tab with no group

Screen by screen. Maya has never used My Tab and has just been handed a bill.

### S1 — First screen

§2.4. She taps **Start a tab**.

### S2 — New Tab

```
┌──────────────────────────────────────────┐
│  ‹                                       │
│                                          │
│  New tab                                 │   title
│                                          │
│  NAME                                    │   micro-label
│  ┌────────────────────────────────────┐  │
│  │ Sukhumvit Dinner                   │  │
│  └────────────────────────────────────┘  │
│                                          │
│  CURRENCY                                │
│  ┌────────────────────────────────────┐  │
│  │ Thai baht  ฿                    ▾  │  │
│  └────────────────────────────────────┘  │
│                                          │
│  WHO PAID                                │
│  ( You )                                 │   participant-chip, preselected
│                                          │
│  HOW MANY PEOPLE                         │
│   [ − ]      5      [ + ]                │   ≥44px targets
│   Including you.                         │   meta
│                                          │
│  ─────────────────────────────────────   │
│                                          │
│  Post this tab in a group? (optional)    │   body
│  ┌────────────────────────────────────┐  │
│  │ Choose a group                  ▾  │  │   present only if ≥1 eligible group
│  └────────────────────────────────────┘  │
│   The group gets one card that stays     │   meta
│   current as people settle.              │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │            Add items               │  │   52px, {colors.primary}
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

**The head-count stepper is new and is load-bearing.** It is what mints the seat bound in
§1.5. Default `2`, minimum `2`, maximum `20`. It is asked here rather than at the share
moment for one reason: **the head count is bill data, not invite data.** Maya needs it to
sanity-check the split regardless, and asking it here keeps the share moment to a single
tap with no question in front of it.

**The group row is optional, last, and absent when it would be useless.** If she has no
eligible groups, the whole block does not render — no disabled control, no explanation of
a thing she does not have. `EXPERIENCE.md`'s rule that My Tab *"never opens a form that
cannot be submitted"* is preserved by removing the requirement, not by blocking the form.

### S3 — Capture

Unchanged. `[ Scan receipt ]` and `[ Add items by hand ]`.

### S4 — Claim Board, empty, alone

The invite affordance is a panel above the item list, and it exists only while she is the
only person on the tab.

```
┌──────────────────────────────────────────┐
│  ‹   Sukhumvit Dinner                    │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  Nobody else is here yet.          │  │  body
│  │  Send the link and they can start  │  │
│  │  claiming while you finish.        │  │
│  │                                    │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │       Send the link          │  │  │  {colors.primary}, 44px
│  │  └──────────────────────────────┘  │  │
│  │                                    │  │
│  │  4 seats left        Copy link     │  │  meta / text link
│  └────────────────────────────────────┘  │
│                                          │
│  Add what you ordered.                   │  existing empty state
│  [ Scan receipt ]  [ Add by hand ]       │
└──────────────────────────────────────────┘
```

`{colors.surface}`, `{rounded.md}`, 1px `{colors.border}`, `{spacing.5}` padding.

Once at least one other person has joined, the panel collapses permanently into a quiet
header row: `presence-stack` on the left, `[ + Add someone ]` on the right. The panel never
returns — a board with people on it does not need to explain itself.

---

## 5. The share moment

*Maya has a bill. She wants Andre, Noi, Ploy and Tim on it.*

### 5.1 What she taps, and what happens underneath

She taps **Send the link**. One tap. Then:

1. The client calls a new Convex action `prepareTabInvite({ tabId })` — a direct sibling of
   `prepareCompletionShare` in `/Users/dre/Desktop/MYTAB/convex/completionShare.ts`, same
   shape, same failure semantics.
2. Server side, in order:
   - `requireBillOrganizer(ctx, tabId)` — the only gate that matters. A participant gets
     nothing.
   - **Reuse** the tab's single active invite token, or mint one if none exists.
     `seatsRemaining` is derived as `seatPolicy.seats − count(tabParticipants)` and lives
     on the tab, not on the token.

     > **Prerequisite — token sprawl must be fixed first.** `claimStatusDelivery` in
     > `/Users/dre/Desktop/MYTAB/convex/lib/telegramStatusManager.ts` currently mints a
     > **fresh** `tab_session` token on *every* status-card delivery attempt, so a tab
     > accumulates one live token per edit. Seats cannot be enforced against a set of
     > tokens that grows every time the card is redrawn. A tab must have **exactly one**
     > active `tab_session` at a time, minted at creation, reused by both the group card
     > and the invite, and revoked only deliberately. This is a correctness prerequisite
     > for §1.5, not an optimization.
   - Build the article **with an inline keyboard**:
     ```ts
     const result: InlineQueryResultArticle = {
       type: "article",
       id: clampInlineResultId(`invite:${tab._id}`),
       title: tab.name,
       description: `${organizerName} started a tab. Tap to claim what you ordered.`,
       input_message_content: {
         message_text: renderTabInvite({ tabName, organizerName }),
         link_preview_options: { is_disabled: true },
       },
       reply_markup: singleButtonKeyboard(
         OPEN_TAB_BUTTON_LABEL,
         buildTelegramDeepLink(token),
       ),
     };
     ```
     > `InlineQueryResultArticle` in `/Users/dre/Desktop/MYTAB/lib/telegram/api.ts` does
     > **not** currently declare `reply_markup`. The Bot API supports it. Extending that
     > type is a required, one-line prerequisite — without it the shared message has no
     > button and the entire flow collapses.
   - `savePreparedInlineMessage(botToken, { userId: maya.telegramUserId, result,
     allowUserChats: true, allowGroupChats: true, allowBotChats: false,
     allowChannelChats: false })` — the same four flags, for the same four reasons already
     argued in `completionShare.ts`.
3. The client calls `WebApp.shareMessage(preparedMessageId, cb)`.
4. **Telegram opens its own share sheet** — Maya's real chat list, her real search, her
   real recents.
5. She picks a chat. **Telegram sends the message as Maya.**

Why this is the right mechanism, said plainly: *the bot is not the author, does not choose
the destination, and does not send anything.* No group. No administrator promotion. No
"add the bot." Maya sends a message to her friends the way she sends every other message.
Four steps became zero.

### 5.2 The honest caveat about `shareMessage`

**`WebApp.shareMessage` picks one chat per call.** This must be designed for, not wished
away.

- **If her friends already share a group chat — the common case — one tap, one pick, done.**
  The message lands in the group and all four see it. The copy nudges this by saying
  "friends", plural, and by keeping the button available rather than declaring victory.
- **If she wants four DMs, she taps four times.** The button label after the first
  successful send becomes `Send to someone else` and a `meta` line appears beneath it in
  place — never a toast:
  ```
  Sent. 4 seats left.
  ```
- **If `shareMessage` returns `sent: false`** — she opened the sheet and backed out —
  nothing changes and nothing is said. Backing out of a share sheet is a normal act, not a
  failure. Same principle as a cancelled wallet prompt.
- **Mint fresh on every tap.** Prepared messages carry Telegram's own `expiration_date`.
  Never cache a `preparedMessageId` across taps.

### 5.3 What her friends receive

Sent by Maya, in their chat:

```
🍜 Sukhumvit Dinner

Maya started a tab. Tap to claim what you ordered.

          [ Open tab ]
```

Share-sheet preview, drawn by Telegram before she picks a chat:

- title: `Sukhumvit Dinner`
- description: `Maya started a tab. Tap to claim what you ordered.`

Same words as the message, so the preview and the sent message never disagree — the same
discipline `renderCompletionShare` already enforces.

**The invite message carries no amounts. Ever.** Not the total, not the head count, not a
per-person figure. Three reasons, all of them binding:

1. NFR-7 — it says strictly less than the bot's own `tab_opened` card.
2. The prepared message may sit unsent in a share sheet, or be sent hours later. A stale
   total sitting in a chat is worse than no total.
3. Because it carries no state, it never needs updating and can never go stale. The
   message is correct forever.

The button label is `Open tab` — `OPEN_TAB_BUTTON_LABEL`, the same promise everywhere,
already exported. It is a **`url`** button, never `web_app`, because the message may land
in a group. The URL is `https://t.me/<bot>/<app>?startapp=<token>` — Story 2.3 AC2 holds
verbatim: no database id, chat id, Telegram id, address, amount, or recipient.

### 5.4 What happens on tap, for someone who has never opened My Tab

Andre taps `[ Open tab ]`.

1. **Telegram's own Mini App consent sheet.** *"**My Tab** — the developer will see your
   name, username, language and profile photo."* This is Telegram's screen, not ours, and
   it is **the only consent screen in the entire product**.
2. **Launch**, ~1s. Wordmark, indeterminate indicator, *"Getting your tab ready…"*.
   Unchanged.
3. Behind it, with no screen of their own: Privy Telegram login runs; an embedded Solana
   wallet is created; `/telegram/bootstrap` verifies the Privy JWT plus raw `initData` and
   creates the five-minute context; the token resolves; a seat is consumed; the
   `tabParticipants` row is written.
4. **Claim Board.** Tab bar hidden (Story 2.6 AC2). Presence stack already showing Maya.
5. **First-timer only** — one `meta` line above the item list, dismissed by any tap:
   ```
   Tap what you ordered. Nothing to install, nothing to sign up for.
   ```
   Not a modal. Not a tour. Not a coach mark. One sentence, once, ever.

**Andre's tap count from receiving the message to claiming a dish: two** — `Open tab`, then
`Green Curry`. Three including Telegram's consent sheet. He is never asked to install,
connect, fund, sign up, or understand anything, which is Flow 2's climax reached by a path
that previously did not exist.

### 5.5 The four hard cases, answered

**They tap while she is still adding items.**
Already designed. The participant empty state fires: *"Maya is adding the bill. You can
stay here — it will appear automatically."* The seat is consumed on **join**, not on
claim, so Andre's avatar appears in Maya's presence stack while she is still fixing the
receipt. That is precisely Flow 1's climax — *"two avatars already there"* — and this flow
makes it **more** likely, not less.

**They tap twice.**
Fully idempotent. The second open finds the existing `tabParticipants` row, consumes no
seat, and routes straight to the Claim Board. Within one session, the module-scope
`consumed` flag in `features/telegram/useStartParamRoute.ts` already prevents a re-route.
Across sessions, step 4 of the resolution order (§5.6) handles it.

**They forward it to someone who was not at dinner.**

- *Seats remain:* that person joins. Maya sees a name and avatar she does not recognize,
  live, in the presence stack. She can **remove a participant who has claimed nothing**,
  which returns the seat. If they have claimed, her existing organizer override (FR-C4)
  releases the claims first. This is the honest answer: software cannot tell a
  friend-of-a-friend from an interloper. Maya can, and she has the tools in the same tap
  distance as everything else.
- *Seats are gone:* they get the full-tab state (§7 row 9) — tab name, people count, and a
  way out. Which is the common case if Maya set the count right, and is why the count is
  asked at S2.
- *Either way:* verified identity, visible by name, no anonymous entry.

**The link is old.**
24-hour TTL, unchanged. Past it, a **non-participant** sees §7 row 6. An **existing
participant** is admitted normally with no message at all, because the roster authorizes
and the token only admits (§1.6).

### 5.6 Resolution order — the authoritative sequence

Server-side, in `resolveTabSession`. The order is the model; do not reorder it.

```
1.  Token parses and resolves to a subject?          no → LINK_NOT_ACTIVE
2.  Verified Privy identity + fresh TG context?      no → OPEN_IN_TELEGRAM
3.  Tab exists and is not closed?                    no → TAB_CLOSED
4.  tabParticipants row already exists for this
    Telegram user id?                                YES → ADMIT. Stop here.
                                                     ↑ regardless of token expiry,
                                                       revocation, seats, or lock.
5.  Token status active (not expired / revoked)?     no → LINK_NOT_ACTIVE
6.  Tab origin is "chat"?                            yes → assertPrivilegedActionAllowed()
                                                           (binding decision 2, verbatim)
                                                       fail → NOT_GROUP_MEMBER | BOT_NOT_ADMIN
7.  Tab status is locked / settled?                  yes → TAB_LOCKED_NO_ENTRY
8.  Seat available under seatPolicy?                 no → TAB_FULL
9.  Consume seat + write tabParticipants + ADMIT     (one transaction)
```

Step 4 sitting above step 5 is §1.6 expressed as code. Step 6 is binding decision 2,
untouched, applied to exactly the tabs it was written for.

---

## 6. Joining — the state table

### 6.1 First-time versus returning

| | First time | Returning |
|---|---|---|
| Telegram consent sheet | shown by Telegram | not shown again |
| Launch duration | ~1s (wallet creation) | shorter (session restore) |
| Login screen | none | none |
| Wallet prompt | none | none |
| First-timer line | shown once | never |
| Landing without a link | First Screen (§2.4) | Tabs, with their open tabs |
| Landing with a link | Claim Board, tab bar hidden | Claim Board, tab bar hidden |

The first-timer line is gated on a server-side flag on `users`, not on browser storage.
The Mini App's storage does not survive a Telegram reinstall, and a returning person
seeing the beginner line again reads as the app not knowing them — which is the one thing
invisible authentication is supposed to buy.

### 6.2 The state table

Read as: arriving person × tab state → outcome. Every cell resolves; there is no state in
this product without designed copy.

| Person | Token | Tab origin | Tab state | Outcome | Copy |
|---|---|---|---|---|---|
| New, not on roster | valid, seats left | invite | draft, no items | **Admit.** Claim Board, waiting state | *"Maya is adding the bill. You can stay here — it will appear automatically."* |
| New, not on roster | valid, seats left | invite | open, items exist | **Admit.** Claim Board + first-timer line | *"Tap what you ordered. Nothing to install, nothing to sign up for."* |
| New, not on roster | valid, **no seats** | invite | any | **Refuse.** Group facts + exit | *"This tab is full. Ask Maya to add you."* |
| New, not on roster | valid, seats left | invite | **locked** | **Refuse.** Group facts + exit | *"Maya already locked this bill. There's nothing left to claim."* |
| New, not on roster | valid, seats left | invite | settled / closed | **Refuse.** Exit | *"This tab is closed."* |
| New, not on roster | **expired or revoked** | any | any | **Refuse.** Exit | *"This link is no longer active. Ask Maya for a new one."* |
| New, not on roster | valid | **chat** | any | live `getChatMember` — decision 2 verbatim | on failure: *"Only people in this chat can open this tab."* |
| Returning, **on roster** | valid | either | draft / open | **Admit.** Claim Board, no intro line | — |
| Returning, **on roster** | **expired or revoked** | either | draft / open | **Admit.** No message | — |
| Returning, **on roster** | valid or not | either | **locked**, has claims | **Admit.** Read-only board, footer `Settle up` | — |
| Returning, **on roster** | valid or not | either | **locked**, **zero claims** | **Admit.** Read-only board, no action | *"You owe nothing on this tab."* |
| Returning, **on roster** | any | either | settled | **Admit.** Read-only, all-square state | — |
| On roster, **left the chat** | any | chat | pre-lock | Reads stay, writes off | *"You're no longer in Sukhumvit Crew, so this tab is read-only for you."* |
| On roster, **left the chat** | any | chat | **post-lock, owes money** | **Reads stay, settlement stays enabled** (§9.3) | — |
| Any | any | any | any, **outside Telegram** | Read-only summary | *"Open this in Telegram to make changes."* |
| Two people, last seat, same instant | valid | invite | open | one admitted, one refused; decrement is transactional | loser sees *"This tab is full. Ask Maya to add you."* |

---

## 7. The failure matrix

Every row: what happened, who sees it, the exact words, the actions offered, and whether
reads survive. No raw codes, no stack traces, no modals, no dead ends.

| # | Trigger | Who sees it | Copy | Actions | Reads survive |
|---|---|---|---|---|---|
| 1 | Bot not an administrator, group-origin tab, privileged action | the group chat | *"I need to be an admin here to start a tab. Add me back as an admin and try again — open tabs stay readable in the meantime."* (existing `renderBotAdminRepairMessage`) | — | yes |
| 2 | Bot not an administrator, **invite-origin tab** | nobody | **cannot occur** — §1.7 | — | n/a |
| 3 | Bot removed from the group mid-tab | organizer, in app | *"I'm not in Sukhumvit Crew any more, so the card there has stopped updating. This tab still works."* | `Post this tab in a group` | yes |
| 4 | Bot removed, participants mid-settle, **bill locked** | nobody | **no interruption.** Settlement is authorized by the roster, not the chat (§9.3) | — | yes |
| 5 | Person left the group, group-origin, pre-lock | that person | *"You're no longer in Sukhumvit Crew, so this tab is read-only for you."* | `Back to my tabs` | yes |
| 6 | Token expired, **not** on roster | the tapper | *"This link is no longer active. Ask Maya for a new one."* | `Back to my tabs` | group facts only |
| 7 | Token revoked, **not** on roster | the tapper | same string, distinct internal code (`LINK_REVOKED` vs `LINK_EXPIRED`) | `Back to my tabs` | group facts only |
| 8 | Token expired or revoked, **on roster** | nobody | **admitted silently** (§1.6) | — | yes |
| 9 | Tab full | the tapper | *"This tab is full. Ask Maya to add you."* + tab name and people count | `Back to my tabs` | group facts only |
| 10 | Tab locked before they ever claimed, not on roster | the tapper | *"Maya already locked this bill. There's nothing left to claim."* | `Back to my tabs` | group facts only |
| 11 | Tab locked, on roster, zero claims | that person | *"You owe nothing on this tab."* — footer states it, no `Settle up` | `See the full bill` | yes, in full |
| 12 | Opened outside Telegram | the visitor | *"Open this in Telegram to make changes."* Never a web sign-up. | — | authenticated reads only |
| 13 | Invite link forwarded to an outsider, seat available | organizer | no message — an unfamiliar name and avatar appear live in the presence stack | `Remove` (organizer, if they have claimed nothing) | yes |
| 14 | `savePreparedInlineMessage` fails, or `WebApp.shareMessage` is unsupported on this Telegram version | the organizer | **no error.** `Send the link` does not render; `Copy link` remains. `shareMessageAvailable()` in `features/telegram/useShareMessage.ts` already gates this correctly — reuse it, do not re-implement | `Copy link` | yes |
| 15 | Prepared message expired inside Telegram's share sheet | nobody | **cannot occur** — minted fresh on every tap (§5.2) | — | n/a |
| 16 | Organizer taps `Send the link` repeatedly | nobody | never surfaced. Abuse ceiling of 30 mints per tab per day, silent | — | yes |
| 17 | Head count lowered below current participants | the organizer | stepper floors and states why: *"5 people are already on this tab."* | — | yes |
| 18 | Tab deleted or closed while a link is live | the tapper | *"This tab is closed."* | `Back to my tabs` | no |
| 19 | Privy login fails on a first-time invite arrival | the tapper | silent retry, then *"Can't get you in right now. Try the link again in a moment."* | `Try again` | no |
| 20 | Two people take the last seat simultaneously | the loser | *"This tab is full. Ask Maya to add you."* | `Back to my tabs` | group facts only |
| 21 | `getChatMember` itself fails (Telegram unreachable) | the tapper, group-origin | *"Can't check the chat right now. Try again in a moment."* — never silently admit | `Try again` | cached reads |

Every "Back to my tabs" lands on Tabs for a returning person and on the First Screen
(§2.4) for someone who has never used My Tab — never on a blank surface.

---

## 8. The upgrade to group mode

A tab started from a link, now wanting a live card in a group.

**Who is asked: the organizer, and only the organizer.** Posting into a group chat touches
people who never opted into this tab, which is exactly the act binding decision 2 was
written to guard. It stays guarded.

### 8.1 The sequence

1. Maya taps `Post this tab in a group` — Claim Board overflow, or the tab's Group row.
2. **If she has eligible groups** (bot present, she is a current member): a picker listing
   them. One tap.
3. **If she has none:**
   ```
   [ Add My Tab to a group ]
   ```
   → `WebApp.openTelegramLink("https://t.me/<bot>?startgroup=true")` → Telegram's own group
   picker → the bot joins → `my_chat_member` arrives → the bot posts its one-time line
   (§3.5) → back in the app, the group is in the picker.
4. On confirm, `assertPrivilegedActionAllowed(groupId, maya)` runs — the full decision-2
   gate: live `getChatMember`, `botIsAdmin`, five-minute freshness. On failure, the
   existing repair copy shows and **nothing is written**.
5. The confirmation, before anything posts:
   ```
   Post in Sukhumvit Crew?

   The group gets one card that stays current as people settle.
   It never shows anyone's individual amount.

   This tab has 1 seat left, so one more person from the group
   can join it.

              [ Post it ]
   ```
6. The tab's `groupId` is rebound from the personal group to the real one.
   `telegramStatusMessages` gets its row, the bot posts `tab_opened`, and from that moment
   the tab behaves exactly like a group-origin tab.
7. **Existing invite-door participants keep their seats and their access, unchanged**, even
   if they are not members of that chat. Their `tabParticipants` rows were already
   authoritative. This is the moment the two doors are visibly one roster.

### 8.2 Seats survive promotion

Promoting does **not** silently open a five-person bill to a twelve-person chat. The seat
policy stays `fixed` and the confirmation says so in plain numbers. Group members who were
not at dinner consume seats like anyone else, and hit §7 row 9 when there are none. Maya
can always add one.

### 8.3 There is no downgrade

Once a tab is in a group, it stays. Retroactively un-posting a card is not something the
product should pretend to do.

---

## 9. Binding decisions this contradicts, and the amendments

Nothing here is silently overridden. Each item names the document, quotes the current
text, and proposes the replacement.

### 9.1 Brief §1, binding decision 2 — bot administrator

**Current:** *"Telegram membership is authoritative. The bot must be a group administrator.
Convex consumes membership updates and refreshes `getChatMember` before join and whenever a
privileged-action cache is older than five minutes."*

**Contradiction:** an invite-origin tab has no group and therefore no administrator, and
must still be able to admit people and move money.

**Amendment 2a — required.** Scope the decision to the tabs it was written for:

> **Telegram membership is authoritative for group-origin tabs.** For a tab created in a
> Telegram chat, the bot must be a group administrator; Convex consumes membership updates
> and refreshes `getChatMember` before join and whenever a privileged-action cache is older
> than five minutes. An invite-origin tab has no chat, cannot cause a bot message
> (structurally — §1.7), and is authorized by a seat-bounded organizer-minted token plus
> verified identity plus a `tabParticipants` row. **`getChatMember` authorizes speaking to
> a group; `tabParticipants` authorizes acting on a bill.**

**Amendment 2b — proposed, gated on one production check.** The Bot API documents
`getChatMember(chat_id, user_id)` as available to any bot that is a member of the chat;
administrator rights are documented as necessary for receiving `chat_member` **push
updates**, not for the on-demand lookup that decision 2 already calls the source of truth.
If that holds in a real supergroup, administrator status is a freshness optimization and
should be demoted to *recommended*, matching the copy in §3.5.

This must be **verified against a real production supergroup before being relied on** —
hidden-member and privacy configurations are the risk. The design does not depend on the
outcome: if the check fails, group-origin tabs keep the administrator requirement exactly
as written and organizers simply use the invite door instead. Ship 2a; treat 2b as a
one-experiment follow-on (§10, item 9).

**Amendment 2c — required, and it is a tightening.** Per §1.9, `resolveTabSession`
currently admits on a cached `groupMembers` row of unbounded age, written from an
unverified webhook payload. Step 6 of §5.6 must call `assertPrivilegedActionAllowed` for
chat-origin tabs, which is the live `getChatMember` refresh decision 2 already requires
and the Mini App join path never performed. Without 2c, this document's invite door would
be strictly stronger than its group door, which would be an absurd place to leave the
product.

### 9.2 Brief §1 decision 4 and §2.8 — token classes

**Current:** *"`tab_session` and `tip_session` links may be revisited within TTL and
authorization scope."* / *"do not reject an authorized tab revisit merely because another
member used the link."*

**Contradiction:** none in spirit — but "authorization scope" is undefined for a tab with
no chat, which is the whole point of the invite door.

**Amendment:**

> A `tab_session` token carries a **seat policy**: `{ kind: "chat" }`, bounded by the
> Telegram chat's own membership, or `{ kind: "fixed", seats: n }`, bounded by a count the
> organizer set. Each new Telegram user id admitted consumes one seat, transactionally. A
> user id already on the roster consumes nothing and revisits unconditionally — **including
> after the token has expired or been revoked** — because the token admits and the roster
> authorizes. Only the tab's organizer may mint an invite or add a seat.

### 9.3 Brief §1 decision 2, consequence — settlement must survive the chat

**Current, by implication:** *"A membership or bot-admin failure leaves the tab readable
but disables mutations."*

**Contradiction:** if the bot is removed from a group after a bill is locked, five people
holding real obligations lose the ability to pay a debt they owe to a named person. The
chat's existence is not a precondition of a debt.

**Amendment:**

> After lock, `tabParticipants` alone authorizes settling one's **own** obligation. Loss of
> group membership or bot-administrator status disables authoring, claiming, locking,
> reopening, waiver, and cash acknowledgement — but never blocks a person from paying what
> they already owe. Before lock, decision 2 applies unchanged.

### 9.4 `EXPERIENCE.md`, Foundation

**Current:** *"Membership is live trust, not a link possession check. The bot must be a
group administrator."*

**Amendment:**

> **Membership is a roster, not a link.** `tabParticipants` is the authoritative membership
> object; a link admits, the roster authorizes. Two doors write into it: a Telegram group
> where the bot is an administrator and live `getChatMember` proves membership, or an
> organizer-minted, seat-bounded invite opened with verified `initData`. Both produce the
> same row and nothing downstream branches on the door. Leaving the group, being removed,
> or bot-admin loss removes write access on a group-origin tab while authorized reads —
> and settlement of an already-locked obligation — remain available.

### 9.5 `EXPERIENCE.md`, Information Architecture and State Patterns

**Current, IA:** *"Without Telegram group context it explains 'Open My Tab from a Telegram
group to start a tab' and opens the bot."*

**Current, State Patterns:** *"Empty — no groups | Tabs | 'No tabs yet. Start one from any
Telegram group.'"*

**Contradiction:** both are the dead end. A button that opens a bot that tells you to go
elsewhere.

**Amendment:** replace both with the First Screen (§2.4). "Start a tab" always works, from
anywhere, with or without a group. The group picker on New Tab is optional, last, and
absent when the person has no eligible groups.

### 9.6 `EXPERIENCE.md`, The Telegram Surface — five events

**Current:** *"Only five events ever post: tab opened · bill ready to settle · payment
confirmed · bill completed · tip confirmed. Nothing else."*

**Contradiction:** the private-chat replies (§3) and the one-time "thanks for the add"
(§3.5) are bot messages and are not on the list.

**Amendment — scope, not expansion:**

> **Exactly five events ever post to a group chat.** Private-chat replies are not events:
> they are reactive, one-per-command, never initiated, and never sent to anyone but the
> person who typed. The one exception in a group is a single acknowledgement when the bot
> is added, posted once per chat and never again. The invite message in §5 is not a bot
> message at all — Telegram sends it as the organizer, which is the same argument
> `completionShare.ts` already makes for `savePreparedInlineMessage`.

### 9.7 `EXPERIENCE.md` Interaction Primitives, and epics Story 8.6 / 7.10 — demo affordances

**Current:** *"The single exception is the demo-mode 'Use sample receipt' affordance, which
is deliberately hidden from judges."*

**Contradiction:** this ships to mainnet with all demo and fixture data removed.

**Amendment:** delete the sentence. Delete the sample-receipt affordance. And specifically
for this document's mechanism: `prepareCompletionShare` currently returns
`{ ok: false, reason: "UNAVAILABLE" }` when `isTelegramFixtureMode()` is true.
`prepareTabInvite` must **not** copy that branch. On mainnet, a missing or fixture bot
token is a **hard configuration failure at boot**, not a silently disabled feature — a
production deployment that cannot mint an invite is a production deployment that cannot
onboard anyone, and it must fail loudly rather than render a First Screen whose only button
does nothing.

### 9.8 Epics, Story 2.5 — command registration

**Current:** *"`/tab`, `/splitbill`, `/tip`, and `/balance` are all registered."*

**Amendment — clarification, not contradiction:** all four remain registered and routed.
The **listed** menu is scoped: `tab · balance · tip · help` in private chats,
`tab · balance · tip` in groups. `/splitbill` routes identically and is not listed.
`/help` is added.

### 9.9 Epics, Story 2.6 AC6 — silent member bootstrap

**Current:** *"Given a Telegram user absent from `groupMembers`... When valid `initData`,
matching `chat_instance`, and `getChatMember` prove current membership Then membership and
`tabParticipants` are created atomically."*

**Amendment:** add the invite branch as a sibling AC:

> **AC7 — First open on an invite-origin tab.** Given a Telegram user who is not on the
> roster, when valid `initData` and a verified Privy identity resolve an active
> `tab_session` with a seat available and the tab is not locked, then the seat is consumed
> and `tabParticipants` is created in one transaction, with no `groupMembers` row and no
> `getChatMember` call. Re-opening creates no second record and consumes no second seat.

### 9.10 Explicitly **not** amended

These are preserved verbatim and this document depends on them:

- FR-G5 / brief §10.3 — *"Do not infer Telegram group membership from client claims."*
- Brief §10.1 — the client never supplies a trusted chat id, Telegram id, recipient
  address, or bill owner id.
- Brief §1 decision 3 — authentication and tab scope stay separate concerns.
- NFR-7 in full. §1.5 and §5.3 show that a forwarded invite exposes strictly less than the
  bot's own group card already does.
- Story 2.3 AC2 — the deep link leaks nothing.
- Story 1.9 in full — opaque, hashed at rest, stable failure codes mapped to product copy.
- The five-event rule as applied to group chats.
### 9.11 Mainnet blockers found in the ingress path

These are not UX amendments. They are things in the current ingress code that must not
reach mainnet, found while mapping the mechanism this document builds on. Each one sits
directly on the invite path.

| # | Location | What it does | Required action |
|---|---|---|---|
| B1 | `convex/http.ts` — `POST /telegram/deep-link` | Mints and **returns a raw `tab_session` token** to any authenticated Privy identity. `mintDeepLinkToken` checks only that the tab exists and the group id matches — **no membership check, no organizer check.** | **Delete the route.** It is an open invite-minting endpoint and it directly defeats §1.4's "only the organizer may invite." `prepareTabInvite` replaces it. |
| B2 | `convex/lib/telegramWebhook.ts` | `FIXTURE_TELEGRAM_WEBHOOK_SECRET = "fixture-telegram-webhook-secret"` is used whenever `TELEGRAM_WEBHOOK_SECRET` is unset — so an unconfigured production deployment accepts any update presenting a **publicly known constant**. | Fail closed at boot. No fallback secret on mainnet. |
| B3 | `convex/lib/telegramDeepLink.ts` | Unset env produces links to `https://t.me/mytab_fixture_bot/app?startapp=…` — every invite Maya sends would point at a bot that does not exist. | Fail closed at boot. No fixture bot username. |
| B4 | `features/tabs/useTabData.ts` | On **any** `TOKEN_*` rejection — including `TOKEN_EXPIRED` and `TOKEN_REVOKED` — it silently falls back to treating the start parameter as a raw `tabs` id. `INVALID_LINK_MESSAGE` is therefore unreachable. | Surface the failure codes. **Every string in §6 and §7 is dead copy until this is fixed.** |
| B5 | `features/tabs/TabDeepLinkSurface.tsx` | Renders `FIXTURE_CLAIM_BOARD` when the query returns `fixture` **or `error`** — so a genuine query failure paints the Sukhumvit Dinner fixture behind an error status. On mainnet that is fabricated money on screen. | Remove the fixture branch entirely. An error state renders an error state. |
| B6 | `convex/demo.ts` | `DEMO_PROTAGONISTS` and `resetDemoData` ship in the deployed function set. | Delete the file. |
| B7 | `convex/lib/tabCommandSync.ts` — `startTabForGroup` | The organizer is never inserted into `tabParticipants`; they join only by tapping their own link. For an invite-origin tab there is no card to tap, so the organizer would not be on their own tab's roster and `requireTabParticipant` would refuse them. | Insert the organizer at tab creation, both doors. Also fixes the existing `peopleCount: Math.max(1, …)` compensation. |
| B8 | `convex/lib/telegramBot.ts` — `publishTabOpenedCard` | Accepts `chatId`, `tabName`, and `opaqueToken` and **ignores all three**; the token that reaches the button is a different one minted later in `claimStatusDelivery`. | Resolve as part of the one-token-per-tab fix in §5.1. Dead parameters that look load-bearing are how the seat bound gets silently defeated. |
| B9 | `convex/sessionTokens.ts` | `revokeToken` and `consumeToken` have **zero callers**; `action_token` for `tip` and `balance` is minted and discarded. | Either wire revocation (§7 row 7 needs it) or remove the dead classes. Do not ship an unused token class into a security model. |


---

## 10. Build order

Ranked by what unblocks a real person on mainnet. Estimates are one engineer, working
days, including tests.

| # | Item | Why it is here | Est. |
|---|---|---|---|
| 1 | **The bot answers a private chat.** Accept non-group updates in `normalizeMessageUpdate`; private command router; `/start`, `/start <token>`, `/tab`, `/tip`, `/balance`, `/help`, fallback with its 60s cap; `my_chat_member` one-time add message; BotFather name, about, description, scoped commands, menu button. | Today a private message is dropped on the floor. Until this ships, every path in §2 can end in silence. Nothing else matters more. | **1.5d** |
| 2 | **Invite-origin tabs.** `groups.kind: "chat" \| "personal"`; personal group created on first cold open; New Tab without a group; the head-count stepper; the First Screen; optional group picker. | Removes the structural precondition that a tab requires a chat. Everything below depends on it. | **2d** |
| 3 | **Seats, and one token per tab.** `seatPolicy` on the tab; stop minting a token per card delivery (§5.1) and fix `publishTabOpenedCard`'s ignored parameters (B8); transactional seat consume; the §5.6 resolution order with roster-before-token; `assertPrivilegedActionAllowed` at step 6 (amendment 2c); organizer inserted at tab creation (B7). | The security bound, and it cannot be enforced against a token set that grows on every card edit. Must land before any link is mintable. | **2d** |
| 4 | **The share moment.** `reply_markup` on `InlineQueryResultArticle`; `renderTabInvite`; `prepareTabInvite` action; delete `POST /telegram/deep-link` (B1); the Claim Board invite panel; `Copy link` fallback. `useShareMessage.ts` already exists and handles the client side — reuse it. | The heart of it. Depends on 2 and 3. | **1.5d** |
| 5 | **Join copy and the failure matrix.** Every string in §6 and §7; surface the `TOKEN_*` codes instead of swallowing them (B4); remove the fixture-on-error branch (B5); `users.hasSeenClaimIntro`. | Without B4 every string in this document is unreachable code. Without it, correct behavior still reads as broken. | **1.5d** |
| 6 | **Roster management.** Organizer adds a seat; removes a participant who has claimed nothing; the presence-stack `+ Add someone` row. | The answer to the forwarded link. Ship with 4, not after. | **1d** |
| 7 | **Promote to group.** `startgroup=true`, eligible-group picker, `groupId` rebind, confirmation copy, `telegramStatusMessages` creation on promotion. | Valuable, but no one is blocked without it. | **1.5d** |
| 8 | **Settlement survives group loss** (§9.3). | Small, and it prevents a real person being locked out of paying a real debt. | **0.5d** |
| 9 | **The bot-admin check** (§9.2, amendment 2b). One production experiment against a real supergroup, then a flag. | Pure friction reduction on the group door. Nothing depends on the result. | **0.5d** |
| 10 | **Mainnet blockers B2, B3, B6, B9** (§9.11). Fail closed on the webhook secret and bot username; delete `convex/demo.ts`; resolve the dead token classes. | Not UX, but they sit on this path and they are the difference between "ships" and "must not ship." | **1d** |
| | **Total** | | **~13d** |

Items 1–6 plus 10 are the shippable unit: a person can find My Tab, start a tab, send a
link, and have four friends claim and settle — with no group and no administrator anywhere
in the path, and no fixture constant reachable in production. Items 7–9 are improvements
to a working product.

The §9.11 blockers are distributed across items 3, 4, 5, and 10 rather than batched, so
each lands with the work that depends on it. **B1 and B4 are hard gates**: B1 leaves an
open invite-minting endpoint that defeats §1.4, and B4 makes every failure string in this
document unreachable.

---

## 11. Open items

- **[VERIFY]** `getChatMember` for a non-administrator member bot in a real production
  supergroup (§9.2, amendment 2b). One experiment. Design holds either way.
- **[VERIFY]** `WebApp.shareMessage` chat-selection behavior on iOS, Android, and Desktop
  Telegram. §5.2 assumes single-chat selection per call and designs for it; if any client
  offers multi-select, the copy in §5.2 relaxes and nothing else changes.
- **[DECIDE]** The head-count maximum. §4 sets 20 provisionally. It should be reconciled
  with the AD-24 rate limits in Story 2.3 AC5 rather than chosen independently.
- **[NOTE]** `InlineQueryResultArticle` in `lib/telegram/api.ts` must gain `reply_markup`
  before item 4 can start. One line, but it is a hard prerequisite and easy to discover
  late.
- **[DECIDE]** `action_token` for `tip` and `balance` is minted and never resolved (B9).
  Either wire it — §7 row 7 needs a real revocation path, and "Maya turns the link off"
  needs `revokeToken` to have a caller — or delete both classes. An unused token class
  inside a security model is a liability, not an option kept open.
- **[NOTE FOR ENGINEERING]** The one-token-per-tab change (§5.1, B8) touches
  `claimStatusDelivery`, which holds the status-card delivery lease. It is the highest-risk
  edit in this plan and should land on its own, ahead of the share moment, with the
  existing delivery tests green before anything in §5 is written.
