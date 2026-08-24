"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { STATE_COPY } from "@/components/primitives/state-copy";
import { ErrorState } from "@/components/primitives/error-state";
import { useOffline } from "@/components/primitives/use-offline";
import { api } from "@/convex/_generated/api";
import { useLiveAction, useLiveMutation } from "@/features/convex/useConvexData";
import { computeBillBreakdown } from "@/lib/domain/bill";
import { fiatMinorFromInteger } from "@/lib/domain/money";
import { SEAT_DEFAULT } from "@/convex/lib/tabOrigin";
import { MYTAB_COLORS } from "@/lib/theme/tokens";
import { USDC_MINT } from "@/lib/solana/constants";
import { AdjustmentsPanel } from "./AdjustmentsPanel";
import { BillEmptyState } from "./BillEmptyState";
import { BillSkeleton } from "./BillSkeleton";
import { BillTotals } from "./BillTotals";
import { currencyUnitToMinor, ItemEditor, minorToCurrencyUnit, safeLineTotalMinor } from "./ItemEditor";
import { ItemRow } from "./ItemRow";
import { NewTabForm, type CaptureMethod, type NewTabFormPatch } from "./NewTabForm";
import { OfflineBar } from "./OfflineBar";
import { submitTabCreation } from "./tabCreationSubmission";
import type { BillAuthoringData, BillItemView } from "./types";

export type BillAuthoringSurfaceProps = {
  /** Identifies the draft upstream. Never rendered — it is a storage key. */
  tabId: string;
  tabTitle?: string;
  viewerUserId?: string;
  /**
   * The draft, resolved by `features/bills/useNewTabData`. Absent only before
   * the first read resolves, which is the one loading state this surface has.
   */
  data?: BillAuthoringData;
  /**
   * Receipt Review entry (`/tabs/[publicToken]/receipt`, POLISH-SPEC §1.5).
   *
   * Every scan affordance on this surface is gated on this handler. The parent
   * passes it only when `api.receipts.isScanEnabled` is true. A visible button
   * that does nothing is worse than an absent one (§1.4).
   */
  onScanReceipt?: () => void;
  /** Enables scan-first creation even before an existing-tab callback exists. */
  receiptScanAvailable?: boolean;
};

type AuthorPhase = "setup" | "items";

/**
 * How long "Start a tab" waits before it admits nothing is happening.
 *
 * Convex parks a mutation until the auth bridge resolves rather than rejecting
 * it, so a stale Privy token produces a promise that simply never settles. Left
 * alone that turns the primary button into a control that swallows the tap and
 * changes nothing on screen — the exact silent degradation this project fails
 * closed against everywhere else.
 */
const CREATE_TIMEOUT_MS = 12_000;

const CREATE_FAILED = "Couldn't start this tab. Try again.";
const CREATE_STALLED =
  "Still trying. Close My Tab and open it again if this keeps happening.";

/**
 * Honest copy for a create that came back refused.
 *
 * Convex redacts the message of a plain `Error` in production, so the code is
 * only readable some of the time and the default has to stand on its own.
 * Neither branch names a mechanism (§4.0 rule 2).
 */
function createFailureMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error ?? "");
  if (detail.includes("TELEGRAM_CONTEXT_REQUIRED") || detail.includes("UNAUTHORIZED")) {
    return "Your Telegram session ran out. Close My Tab and open it again.";
  }
  if (detail.includes("INVALID_TITLE")) {
    return "Give this tab a name first.";
  }
  if (detail.includes("INVALID_SEATS")) {
    return "Pick somewhere between 2 and 20 people.";
  }
  return CREATE_FAILED;
}

/** Full tab authoring surface — Epic 4 stories 4.1–4.4, rebuilt per §1.4. */
export function BillAuthoringSurface({
  tabTitle,
  viewerUserId,
  data,
  onScanReceipt,
  receiptScanAvailable = false,
}: BillAuthoringSurfaceProps) {
  const resolved = data ?? null;
  const router = useRouter();
  const createPersonalTab = useLiveMutation(api.tabs.createPersonalTab);
  const createChatTab = useLiveAction(api.tabCreation.createChatTab);
  const [phase, setPhase] = useState<AuthorPhase>(() =>
    resolved?.items.length ? "items" : "setup",
  );
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const creationAttemptRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const creationRequestRef = useRef(0);
  const offline = useOffline();
  const [showEditor, setShowEditor] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  /**
   * The draft holds *edits only* — what the person actually typed or tapped.
   *
   * Everything else on this form arrives from Convex after first paint:
   * `viewerIdentity` on a personal tab, `listTabMemberOptions` on a group one.
   * Seeding local state from `data` in a `useState` initialiser froze that
   * first, empty read for the life of the surface — the roster stayed `[]`,
   * `payerUserId` stayed `""`, and "Who paid?" was pinned to "Nobody in this
   * group has opened My Tab yet" with no avatar to pick and no way forward.
   *
   * So an unedited field reads *through* to the live value, and only a real
   * edit shadows it. That is also why `undefined` is the untouched marker
   * rather than `""`: clearing the title must stay cleared.
   */
  const [edits, setEdits] = useState<{
    title?: string;
    merchantName?: string;
    displayCurrency?: string;
    receiveMint?: string;
    payerUserId?: string;
    captureMethod?: CaptureMethod;
    seats?: number;
  }>({});

  const form = {
    title: edits.title ?? resolved?.title ?? tabTitle ?? "",
    merchantName: edits.merchantName ?? resolved?.merchantName ?? "",
    displayCurrency: edits.displayCurrency ?? resolved?.displayCurrency ?? "THB",
    receiveMint: edits.receiveMint ?? resolved?.receiveMint ?? USDC_MINT,
    payerUserId: edits.payerUserId ?? resolved?.payerUserId ?? viewerUserId ?? "",
    captureMethod: edits.captureMethod ?? ("manual" as CaptureMethod),
    members: resolved?.members ?? [],
    organizerDisplayName: resolved?.organizerDisplayName ?? "Organizer",
    fxFixtureBadge: resolved?.fxFixtureBadge,
    seats: edits.seats ?? resolved?.seats ?? SEAT_DEFAULT,
    origin: resolved?.origin ?? "personal",
  };

  const [items, setItems] = useState<BillItemView[]>(resolved?.items ?? []);
  const [adjustments] = useState(resolved?.adjustments ?? []);
  const [editorDraft, setEditorDraft] = useState({
    name: "",
    quantity: 1,
    unitPriceInput: "",
  });

  /**
   * The organizer check. `organizerUserId` is the authority.
   *
   * It is the empty string until the group's member list resolves, and on this
   * route the person who opened it is the one authoring — so an unresolved
   * organizer is not evidence that they are merely a participant.
   */
  const organizerUserId = resolved?.organizerUserId;
  const isOrganizer = organizerUserId ? viewerUserId === organizerUserId : true;

  /**
   * There is exactly one loading state on this surface and it is first paint
   * with no data at all. Authoring is local until submitted, so there is no
   * "subsequent" load and no spinner over correct data (§4.1; EXPERIENCE,
   * *State Patterns*).
   */
  const showSetupError = Boolean(resolved?.setupError);
  const showSkeleton = resolved == null || (resolved.setupReady === false && !showSetupError);

  const scanAvailable = receiptScanAvailable || onScanReceipt != null;

  const breakdown = useMemo(() => {
    if (items.length === 0) {
      return null;
    }
    try {
      return computeBillBreakdown(
        items.map((item) => ({ lineTotalMinor: fiatMinorFromInteger(item.lineTotalMinor) })),
        adjustments.map((adjustment) => ({
          kind: adjustment.kind,
          calculation: adjustment.calculation,
          valueMinorOrBps: adjustment.valueMinorOrBps,
        })),
      );
    } catch {
      return null;
    }
  }, [items, adjustments]);

  const handleFormChange = useCallback((patch: NewTabFormPatch) => {
    setEdits((current) => ({ ...current, ...patch }));
  }, []);

  const openNewItemEditor = useCallback(() => {
    setEditingItemId(null);
    setEditorDraft({ name: "", quantity: 1, unitPriceInput: "" });
    setShowEditor(true);
  }, []);

  const openEditItem = useCallback(
    (itemId: string) => {
      const item = items.find((row) => row._id === itemId);
      if (!item) {
        return;
      }
      setEditingItemId(itemId);
      setEditorDraft({
        name: item.name,
        quantity: item.quantity,
        unitPriceInput: minorToCurrencyUnit(item.unitPriceMinor, form.displayCurrency),
      });
      setShowEditor(true);
    },
    [form.displayCurrency, items],
  );

  const saveItem = useCallback(() => {
    const name = editorDraft.name.trim();
    const unitPriceMinor = currencyUnitToMinor(editorDraft.unitPriceInput, form.displayCurrency);

    // The editor will not call this while invalid; the guard keeps a
    // `name: ""` at ฿0.00 out of the list if it ever does.
    if (name.length === 0 || unitPriceMinor <= 0) {
      return;
    }

    const lineTotalMinor = safeLineTotalMinor(unitPriceMinor, editorDraft.quantity);
    if (lineTotalMinor === null) return;

    if (editingItemId) {
      setItems((current) =>
        current.map((item) =>
          item._id === editingItemId
            ? { ...item, name, quantity: editorDraft.quantity, unitPriceMinor, lineTotalMinor }
            : item,
        ),
      );
    } else {
      setItems((current) => [
        ...current,
        {
          _id: `items:${current.length + 1}`,
          name,
          quantity: editorDraft.quantity,
          unitPriceMinor,
          lineTotalMinor,
          source: "manual" as const,
        },
      ]);
    }

    setShowEditor(false);
    setPhase("items");
  }, [editorDraft, editingItemId, form.displayCurrency]);

  const duplicateItem = useCallback((itemId: string) => {
    setItems((current) => {
      const source = current.find((item) => item._id === itemId);
      if (!source) {
        return current;
      }
      return [...current, { ...source, _id: `items:${current.length + 1}` }];
    });
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setItems((current) => current.filter((item) => item._id !== itemId));
  }, []);

  const startCapture = useCallback(() => {
    if (phase === "setup") {
      const createUnavailable = form.origin === "personal" ? !createPersonalTab : !createChatTab;
      if (createUnavailable || creating) {
        return;
      }
      setCreating(true);
      setCreateError(null);
      const fingerprint = JSON.stringify({
        origin: form.origin,
        title: form.title.trim(),
        merchantName: form.merchantName.trim(),
        displayCurrency: form.displayCurrency,
        receiveMint: form.receiveMint,
        seats: form.seats,
        groupId: resolved?.groupId ?? null,
        payerUserId: form.payerUserId,
      });
      if (creationAttemptRef.current?.fingerprint !== fingerprint) {
        creationAttemptRef.current = {
          fingerprint,
          key: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        };
      }
      const requestId = creationRequestRef.current + 1;
      creationRequestRef.current = requestId;
      const stalled = setTimeout(() => {
        if (creationRequestRef.current !== requestId) return;
        creationRequestRef.current += 1;
        setCreateError(CREATE_STALLED);
        setCreating(false);
      }, CREATE_TIMEOUT_MS);
      void submitTabCreation({
        origin: form.origin,
        title: form.title,
        merchantName: form.merchantName,
        displayCurrency: form.displayCurrency,
        receiveMint: form.receiveMint,
        payerUserId: form.payerUserId,
        seats: form.seats,
        groupId: resolved?.groupId,
        captureMethod: form.captureMethod,
        scanAvailable,
        idempotencyKey: creationAttemptRef.current.key,
      }, {
        createPersonal: (args) => {
          if (!createPersonalTab) throw new Error("TAB_CREATE_UNAVAILABLE");
          return createPersonalTab(args as never);
        },
        createChat: (args) => {
          if (!createChatTab) throw new Error("TAB_CREATE_UNAVAILABLE");
          return createChatTab(args as never);
        },
      })
        .then(({ destination }) => {
          clearTimeout(stalled);
          if (creationRequestRef.current !== requestId) return;
          router.push(destination);
        })
        .catch((error: unknown) => {
          clearTimeout(stalled);
          if (creationRequestRef.current !== requestId) return;
          setCreateError(createFailureMessage(error));
          setCreating(false);
        });
      return;
    }
    setPhase("items");
    openNewItemEditor();
  }, [
    createPersonalTab,
    createChatTab,
    creating,
    form.captureMethod,
    form.displayCurrency,
    form.receiveMint,
    form.merchantName,
    form.origin,
    form.payerUserId,
    form.seats,
    form.title,
    onScanReceipt,
    openNewItemEditor,
    router,
    resolved,
    phase,
    scanAvailable,
  ]);

  /*
   * Every reason this control is disabled, in the order the person can act on
   * them. A disabled primary button that states nothing is the defect §4.4
   * exists to prevent — and on this route it was the whole failure: the tap
   * went nowhere and the screen said nothing about why.
   */
  const cannotWrite = form.origin === "personal" ? !createPersonalTab : !createChatTab;
  const setupBlockedReason = resolved?.setupReady === false
    ? "Getting the people and payment details ready…"
    : offline
    ? STATE_COPY.needsConnection
    : form.title.trim().length === 0
      ? "Give this tab a name first."
      : form.title.trim().length > 120
        ? "Keep the tab name to 120 characters."
      : cannotWrite
        ? STATE_COPY.outsideTelegram
        : null;

  const primaryAction = (
    <>
      {phase === "setup" ? (
        <button
          type="button"
          className="mytab-button-primary"
          onClick={startCapture}
          disabled={setupBlockedReason !== null || creating}
          data-testid="primary-add-items"
        >
          {creating ? "Starting…" : form.origin === "personal" ? "Start tab" : "Add items"}
        </button>
      ) : (
        <button
          type="button"
          className="mytab-button-primary"
          onClick={openNewItemEditor}
          disabled={offline}
          data-testid="primary-add-item"
        >
          Add item
        </button>
      )}
      {/* A disabled control states its reason rather than going silent (§4.4). */}
      {createError ? (
        <p
          role="status"
          aria-live="polite"
          className="mytab-type-meta"
          style={{ margin: "8px 0 0", textAlign: "center" }}
          data-testid="primary-action-error"
        >
          {createError}
        </p>
      ) : null}
      {!createError && phase === "setup" && setupBlockedReason ? (
        <p
          className="mytab-type-meta"
          style={{ margin: "8px 0 0", textAlign: "center" }}
          data-testid="primary-action-reason"
        >
          {setupBlockedReason}
        </p>
      ) : null}
      {!createError && phase !== "setup" && offline ? (
        <p className="mytab-type-meta" style={{ margin: "8px 0 0", textAlign: "center" }}>
          {STATE_COPY.needsConnection}
        </p>
      ) : null}
    </>
  );

  const showFooter = isOrganizer && !showSkeleton && !showSetupError && !showEditor;
  const hairline = `1px solid ${MYTAB_COLORS.border}`;

  return (
    <>
      <OfflineBar visible={offline} />
      {/* Authoring keeps the tab bar. Only the deep-linked Claim Board hides it
          (EXPERIENCE, Information Architecture; POLISH-SPEC §1.0). */}
      <AppShell footer={showFooter ? primaryAction : undefined}>
        <header style={{ paddingTop: 8, paddingBottom: 16 }}>
          <h1 className="mytab-type-title" style={{ margin: 0 }}>
            {phase === "setup" && isOrganizer ? "Start a tab" : form.title}
          </h1>
          {phase !== "setup" && form.merchantName ? (
            <p className="mytab-type-meta" style={{ margin: "4px 0 0" }}>
              {form.merchantName}
            </p>
          ) : null}
        </header>

        {showSkeleton ? <BillSkeleton /> : null}

        {showSetupError ? (
          <ErrorState
            headline={resolved?.setupError ?? "Couldn't load tab setup."}
            actions={resolved?.retrySetup ? [{ label: STATE_COPY.retry, onPress: resolved.retrySetup }] : []}
          />
        ) : null}

        {!showSkeleton && !showSetupError && phase === "setup" && isOrganizer ? (
          <NewTabForm
            title={form.title}
            merchantName={form.merchantName}
            displayCurrency={form.displayCurrency}
            receiveMint={form.receiveMint}
            receiveAssetOptions={resolved?.receiveAssetOptions}
            payerUserId={form.payerUserId}
            members={form.members}
            viewerUserId={viewerUserId}
            captureMethod={scanAvailable ? form.captureMethod : "manual"}
            scanAvailable={scanAvailable}
            seats={form.origin === "personal" ? form.seats : undefined}
            showCapture
            variant={form.origin === "personal" ? "quick" : "full"}
            fxFixtureBadge={form.fxFixtureBadge}
            onChange={handleFormChange}
          />
        ) : null}

        {!showSkeleton && !showSetupError && phase === "items" ? (
          <>
            {showEditor && isOrganizer ? (
              <ItemEditor
                name={editorDraft.name}
                quantity={editorDraft.quantity}
                unitPriceInput={editorDraft.unitPriceInput}
                displayCurrency={form.displayCurrency}
                onChange={(patch) => setEditorDraft((current) => ({ ...current, ...patch }))}
                onSave={saveItem}
                onCancel={() => setShowEditor(false)}
              />
            ) : null}

            {!showEditor && items.length === 0 ? (
              <BillEmptyState
                isOrganizer={isOrganizer}
                organizerDisplayName={form.organizerDisplayName}
                onAddManual={openNewItemEditor}
                onScanReceipt={scanAvailable ? onScanReceipt : undefined}
              />
            ) : null}

            {/*
              One card. Items, adjustments and totals are separated by
              `colors/border` hairlines inside it — DESIGN.md bans giving each
              section its own rounded card.
            */}
            {!showEditor && items.length > 0 ? (
              <section className="mytab-card" style={{ overflow: "hidden" }}>
                <div style={{ padding: "4px 20px" }}>
                  {items.map((item, index) => (
                    <ItemRow
                      key={item._id}
                      item={item}
                      displayCurrency={form.displayCurrency}
                      editable={isOrganizer}
                      divider={index > 0}
                      onEdit={openEditItem}
                      onDuplicate={duplicateItem}
                      onRemove={removeItem}
                    />
                  ))}
                </div>

                <div style={{ borderTop: hairline, padding: 20 }}>
                  <AdjustmentsPanel adjustments={adjustments} editable={isOrganizer} />
                </div>

                {breakdown ? (
                  <div style={{ borderTop: hairline, padding: 20 }}>
                    <BillTotals lines={breakdown.lines} displayCurrency={form.displayCurrency} />
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}

        {!showSkeleton && !showSetupError && !isOrganizer && phase === "setup" ? (
          <BillEmptyState
            isOrganizer={false}
            organizerDisplayName={form.organizerDisplayName}
          />
        ) : null}
      </AppShell>
    </>
  );
}

export type { BillAuthoringData };
