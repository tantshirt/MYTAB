"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import { CameraIcon, EditIcon } from "@/components/icons";
import {
  avatarTintsForGroup,
  MYTAB_COLORS,
  MYTAB_ELEVATION,
  MYTAB_RADIUS,
} from "@/lib/theme/tokens";
import type { BillMemberOption } from "./types";

/** How the organizer intends to get the items in (EXPERIENCE, IA: "capture method"). */
export type CaptureMethod = "scan" | "manual";

export type NewTabFormPatch = {
  title?: string;
  merchantName?: string;
  displayCurrency?: string;
  payerUserId?: string;
  captureMethod?: CaptureMethod;
  seats?: number;
};

export type NewTabFormProps = {
  title: string;
  merchantName: string;
  displayCurrency: string;
  /** Chip pair. Two values; the artboard's pair is THB / USDC. */
  currencyOptions?: readonly string[];
  payerUserId: string;
  members: BillMemberOption[];
  viewerUserId?: string;
  captureMethod: CaptureMethod;
  /**
   * Card A ("Scan receipt") renders only when receipt scanning is both flagged
   * on and actually wired. It is never shown disabled (POLISH-SPEC §1.4).
   */
  scanAvailable?: boolean;
  fxFixtureBadge?: string;
  /** INVITE-FLOW §4 — shown only on a personal tab. Default 2, min 2, max 20. */
  seats?: number;
  /** Capture is S3 on a personal tab — the claim board empty state, not this form. */
  showCapture?: boolean;
  /**
   * How much of the form stands between a person and a started tab.
   *
   * `"quick"` is the personal door: what it's for, how many people, go. Three
   * of the five sections were removed from it rather than restyled, because
   * each one was asking a question the screen could not yet answer honestly:
   *
   *   Where       — merchant name is on the receipt. Scanning fills it in, and
   *                 typing it before the tab exists buys nothing.
   *   Currency    — offered THB or USDC, which are not the same kind of thing.
   *                 The bill is denominated in local fiat; which token each
   *                 person pays with is that person's choice at pay time. The
   *                 money domain is THB-only today (`lib/domain/fx.ts` is
   *                 literally USDC_ATOMIC_PER_THB_MINOR), so a chip pair here
   *                 was one real option and one category error.
   *   Who paid?   — on a personal tab the member list is exactly the viewer,
   *                 so this was a single avatar of yourself, pre-selected.
   *
   * `"full"` is the group door and is unchanged.
   */
  variant?: "quick" | "full";
  onChange: (patch: NewTabFormPatch) => void;
};

const DEFAULT_CURRENCIES = ["THB", "USDC"] as const;

const BARE_BUTTON: CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
  border: 0,
  background: "none",
  padding: 0,
  margin: 0,
  font: "inherit",
  color: "inherit",
  textAlign: "left",
  cursor: "pointer",
};

type RadioOption = {
  key: string;
  /** Accessible name — the visual child may be an avatar or a card. */
  label: string;
  render: (selected: boolean) => ReactNode;
  style?: CSSProperties;
};

/**
 * Roving-tabindex radio group.
 *
 * `participant-chip` and the currency chips are single-select, so the correct
 * role is `radio`, not `aria-pressed` (POLISH-SPEC §6.1 flags exactly that).
 */
function RadioRow({
  name,
  labelledBy,
  options,
  selectedKey,
  onSelect,
  style,
}: {
  name: string;
  labelledBy: string;
  options: RadioOption[];
  selectedKey: string;
  onSelect: (key: string) => void;
  style?: CSSProperties;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const hasSelection = options.some((option) => option.key === selectedKey);

  const move = (from: number, delta: number) => {
    const next = (from + delta + options.length) % options.length;
    const option = options[next];
    if (!option) {
      return;
    }
    onSelect(option.key);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} style={style}>
      {options.map((option, index) => {
        const selected = option.key === selectedKey;
        return (
          <button
            key={option.key}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            tabIndex={selected || (!hasSelection && index === 0) ? 0 : -1}
            className="mytab-focus"
            data-testid={`${name}-${option.key}`}
            onClick={() => onSelect(option.key)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                move(index, 1);
              } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                move(index, -1);
              }
            }}
            style={{ ...BARE_BUTTON, ...option.style }}
          >
            {option.render(selected)}
          </button>
        );
      })}
    </div>
  );
}

function Section({
  id,
  heading,
  children,
  gap = 9,
  marginBottom = 28,
}: {
  id: string;
  heading: string;
  children: ReactNode;
  gap?: number;
  marginBottom?: number;
}) {
  return (
    <section style={{ marginBottom }}>
      {/*
        micro-label is the *section heading* role (DESIGN.md, Typography), so it
        is a heading element here and never a <label> on a control. Sections
        holding a single control point that control at this id instead.
      */}
      <h2 id={id} className="mytab-type-micro-label" style={{ margin: `0 0 ${gap}px` }}>
        {heading}
      </h2>
      {children}
    </section>
  );
}

function CaptureCard({
  icon,
  title,
  description,
  selected,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  selected: boolean;
}) {
  return (
    <span
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: 12,
        height: "100%",
        textAlign: "center",
        padding: "24px 18px",
        borderRadius: MYTAB_RADIUS.md,
        border: `1px solid ${selected ? MYTAB_COLORS.primary : MYTAB_COLORS.border}`,
        background: selected ? MYTAB_COLORS.primarySoft : MYTAB_COLORS.surface,
        boxShadow: selected ? "none" : MYTAB_ELEVATION.cardShadow,
      }}
    >
      {icon}
      <span style={{ display: "block", minWidth: 0 }}>
        <span style={{ display: "block", fontSize: "15px", fontWeight: 600 }}>{title}</span>
        <span
          style={{
            display: "block",
            fontSize: "12px",
            color: MYTAB_COLORS.inkMuted,
            marginTop: 4,
            lineHeight: 1.4,
          }}
        >
          {description}
        </span>
      </span>
    </span>
  );
}

/**
 * New Tab setup — what the tab is for, where, currency, who paid, and how the
 * items get in (POLISH-SPEC §1.4; EXPERIENCE, Information Architecture).
 *
 * No per-section cards: micro-label headings sit directly on `colors/paper`,
 * which is what the artboard specifies and what DESIGN.md requires.
 */
export function NewTabForm({
  title,
  merchantName,
  displayCurrency,
  currencyOptions = DEFAULT_CURRENCIES,
  payerUserId,
  members,
  viewerUserId,
  captureMethod,
  scanAvailable = false,
  fxFixtureBadge,
  seats,
  showCapture = true,
  variant = "full",
  onChange,
}: NewTabFormProps) {
  const quick = variant === "quick";
  const currencies = currencyOptions.map<RadioOption>((currency) => ({
    key: currency,
    label: currency,
    render: (selected) => (
      <span
        style={{
          display: "flex",
          alignItems: "center",
          minHeight: 44,
          padding: "0 22px",
          borderRadius: MYTAB_RADIUS.full,
          fontSize: "15px",
          fontWeight: 600,
          background: selected ? MYTAB_COLORS.primarySoft : MYTAB_COLORS.surface,
          color: selected ? MYTAB_COLORS.primary : MYTAB_COLORS.ink,
          border: `1px solid ${selected ? MYTAB_COLORS.primary : MYTAB_COLORS.border}`,
        }}
      >
        {currency}
      </span>
    ),
  }));

  // The payer row is a set of people rendered together (§2.6).
  const payerTints = avatarTintsForGroup(members.map((member) => member.userId));

  const payers = members.map<RadioOption>((member) => {
    const name = member.userId === viewerUserId ? "You" : member.displayName;
    return {
      key: member.userId,
      // The accessible name is the visible name, so "You" reads as "You".
      label: name,
      style: { width: 52, flex: "none" },
      render: (selected) => (
        <span
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 7,
            width: 52,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 48,
              height: 48,
              flex: "none",
              borderRadius: MYTAB_RADIUS.full,
              background: payerTints.get(member.userId),
              color: MYTAB_COLORS.surface,
              fontSize: "17px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              // A ring, never a fill — the face stays readable (DESIGN.md).
              boxShadow: selected ? `0 0 0 2px ${MYTAB_COLORS.primary}` : "none",
            }}
          >
            {/* The initial always comes from the real name, never from "You". */}
            {member.displayName.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <span
            style={{
              maxWidth: 52,
              fontSize: "12px",
              fontWeight: selected ? 600 : 400,
              color: selected ? MYTAB_COLORS.ink : MYTAB_COLORS.inkMuted,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name}
          </span>
        </span>
      ),
    };
  });

  const captureOptions: RadioOption[] = [];
  if (scanAvailable) {
    captureOptions.push({
      key: "scan",
      label: "Scan receipt",
      style: { display: "flex", flex: "1 1 0", minWidth: 0 },
      render: (selected) => (
        <CaptureCard
          selected={selected}
          icon={<CameraIcon size={28} style={{ color: MYTAB_COLORS.primary }} />}
          title="Scan receipt"
          description="Photograph it, then fix anything wrong"
        />
      ),
    });
  }
  captureOptions.push({
    key: "manual",
    label: "Add manually",
    style: { display: "flex", flex: "1 1 0", minWidth: 0 },
    render: (selected) => (
      <CaptureCard
        selected={selected}
        icon={<EditIcon size={28} style={{ color: MYTAB_COLORS.ink }} />}
        title="Add manually"
        description="Type each dish and price"
      />
    ),
  });

  return (
    <div data-testid="new-tab-form" style={{ paddingBottom: 24 }}>
      <Section id="tab-title-label" heading="What's this tab for?">
        <input
          id="tab-title"
          aria-labelledby="tab-title-label"
          value={title}
          onChange={(event) => onChange({ title: event.target.value })}
          className="mytab-input"
          placeholder="Dinner at Zuma"
          autoFocus={quick}
          maxLength={120}
        />
      </Section>

      {quick ? null : (
        <Section id="tab-merchant-label" heading="Where">
          <input
            id="tab-merchant"
            aria-labelledby="tab-merchant-label"
            value={merchantName}
            onChange={(event) => onChange({ merchantName: event.target.value })}
            className="mytab-input"
            placeholder="Somtum Der"
            maxLength={120}
          />
        </Section>
      )}

      {quick ? null : (
        <Section
          id="tab-currency-label"
          heading="Currency"
          marginBottom={fxFixtureBadge ? 12 : 28}
        >
          <RadioRow
            name="currency"
            labelledBy="tab-currency-label"
            options={currencies}
            selectedKey={displayCurrency}
            onSelect={(key) => onChange({ displayCurrency: key })}
            style={{ display: "flex", flexWrap: "wrap", gap: 10 }}
          />
        </Section>
      )}

      {!quick && fxFixtureBadge ? (
        <p
          className="mytab-type-meta"
          style={{ margin: "0 0 28px", color: MYTAB_COLORS.warning }}
          data-testid="fx-fixture-badge"
        >
          {fxFixtureBadge}
        </p>
      ) : null}

      {seats !== undefined ? (
        <Section id="tab-seats-label" heading="How many people" gap={12} marginBottom={28}>
          <div
            role="group"
            aria-labelledby="tab-seats-label"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            <button
              type="button"
              className="mytab-focus"
              aria-label="Fewer people"
              disabled={seats <= 2}
              onClick={() => onChange({ seats: Math.max(2, seats - 1) })}
              style={{
                ...BARE_BUTTON,
                width: 44,
                height: 44,
                minWidth: 44,
                minHeight: 44,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: MYTAB_RADIUS.full,
                border: `1px solid ${MYTAB_COLORS.border}`,
                background: MYTAB_COLORS.surface,
                fontSize: 22,
                fontWeight: 500,
              }}
            >
              −
            </button>
            <span
              className="mytab-tabular"
              aria-live="polite"
              style={{
                minWidth: "2.5ch",
                textAlign: "center",
                fontSize: 24,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {seats}
            </span>
            <button
              type="button"
              className="mytab-focus"
              aria-label="More people"
              disabled={seats >= 20}
              onClick={() => onChange({ seats: Math.min(20, seats + 1) })}
              style={{
                ...BARE_BUTTON,
                width: 44,
                height: 44,
                minWidth: 44,
                minHeight: 44,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: MYTAB_RADIUS.full,
                border: `1px solid ${MYTAB_COLORS.border}`,
                background: MYTAB_COLORS.surface,
                fontSize: 22,
                fontWeight: 500,
              }}
            >
              +
            </button>
          </div>
          <p className="mytab-type-meta" style={{ margin: "8px 0 0" }}>
            Including you.
          </p>
        </Section>
      ) : null}

      {quick ? null : (
      <Section id="tab-payer-label" heading="Who paid?" gap={12} marginBottom={34}>
        {payers.length === 0 ? (
          <p className="mytab-type-meta" style={{ margin: 0 }}>
            Nobody in this group has opened My Tab yet. Ask someone to tap the link.
          </p>
        ) : (
          <RadioRow
            name="payer"
            labelledBy="tab-payer-label"
            options={payers}
            selectedKey={payerUserId}
            onSelect={(key) => onChange({ payerUserId: key })}
            /* Wraps rather than scrolls, so the row holds at 320px with no
               horizontal scroll anywhere (EXPERIENCE, Responsive & Platform). */
            style={{ display: "flex", flexWrap: "wrap", gap: 16 }}
          />
        )}
      </Section>
      )}

      {showCapture ? (
        <Section id="tab-capture-label" heading="Add the items" gap={12} marginBottom={0}>
          <RadioRow
            name="capture"
            labelledBy="tab-capture-label"
            options={captureOptions}
            selectedKey={captureMethod}
            onSelect={(key) => onChange({ captureMethod: key as CaptureMethod })}
            style={{ display: "flex", gap: 12, alignItems: "stretch" }}
          />
        </Section>
      ) : null}
    </div>
  );
}
