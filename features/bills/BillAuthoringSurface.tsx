"use client";

import { useCallback, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { STATE_COPY } from "@/components/primitives/state-copy";
import { useOffline } from "@/components/primitives/use-offline";
import { computeBillBreakdown } from "@/lib/domain/bill";
import { fiatMinorFromInteger } from "@/lib/domain/money";
import { isReceiptScanEnabled } from "@/lib/features/flags";
import { MYTAB_COLORS } from "@/lib/theme/tokens";
import { AdjustmentsPanel } from "./AdjustmentsPanel";
import { BillEmptyState } from "./BillEmptyState";
import { BillSkeleton } from "./BillSkeleton";
import { BillTotals } from "./BillTotals";
import { bahtToMinor, ItemEditor, minorToBaht } from "./ItemEditor";
import { ItemRow } from "./ItemRow";
import { NewTabForm, type CaptureMethod, type NewTabFormPatch } from "./NewTabForm";
import { OfflineBar } from "./OfflineBar";
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
   * Every scan affordance on this surface is gated on this handler *and*
   * `isReceiptScanEnabled()`. Without both it does not render at all — a visible
   * button that does nothing is worse than an absent one (§1.4).
   */
  onScanReceipt?: () => void;
};

type AuthorPhase = "setup" | "items";

/** Full tab authoring surface — Epic 4 stories 4.1–4.4, rebuilt per §1.4. */
export function BillAuthoringSurface({
  tabTitle,
  viewerUserId,
  data,
  onScanReceipt,
}: BillAuthoringSurfaceProps) {
  const resolved = data ?? null;
  const [phase, setPhase] = useState<AuthorPhase>(() =>
    resolved?.items.length ? "items" : "setup",
  );
  const offline = useOffline();
  const [showEditor, setShowEditor] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const [form, setForm] = useState(() => ({
    title: resolved?.title ?? tabTitle ?? "New tab",
    merchantName: resolved?.merchantName ?? "",
    displayCurrency: resolved?.displayCurrency ?? "THB",
    payerUserId: resolved?.payerUserId ?? viewerUserId ?? "",
    captureMethod: "manual" as CaptureMethod,
    members: resolved?.members ?? [],
    organizerDisplayName: resolved?.organizerDisplayName ?? "Organizer",
    fxFixtureBadge: resolved?.fxFixtureBadge,
  }));

  const [items, setItems] = useState<BillItemView[]>(resolved?.items ?? []);
  const [adjustments] = useState(resolved?.adjustments ?? []);
  const [editorDraft, setEditorDraft] = useState({
    name: "",
    quantity: 1,
    unitPriceBaht: 0,
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
  const showSkeleton = resolved == null;

  const scanAvailable = isReceiptScanEnabled() && onScanReceipt != null;

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
    setForm((current) => ({ ...current, ...patch }));
  }, []);

  const openNewItemEditor = useCallback(() => {
    setEditingItemId(null);
    setEditorDraft({ name: "", quantity: 1, unitPriceBaht: 0 });
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
        unitPriceBaht: minorToBaht(item.unitPriceMinor),
      });
      setShowEditor(true);
    },
    [items],
  );

  const saveItem = useCallback(() => {
    const name = editorDraft.name.trim();
    const unitPriceMinor = bahtToMinor(editorDraft.unitPriceBaht);

    // The editor will not call this while invalid; the guard keeps a
    // `name: ""` at ฿0.00 out of the list if it ever does.
    if (name.length === 0 || unitPriceMinor <= 0) {
      return;
    }

    const lineTotalMinor = unitPriceMinor * editorDraft.quantity;

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
  }, [editorDraft, editingItemId]);

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
    if (form.captureMethod === "scan" && onScanReceipt) {
      onScanReceipt();
      return;
    }
    setPhase("items");
    openNewItemEditor();
  }, [form.captureMethod, onScanReceipt, openNewItemEditor]);

  const primaryAction = (
    <>
      {phase === "setup" ? (
        <button
          type="button"
          className="mytab-button-primary"
          onClick={startCapture}
          disabled={offline || form.title.trim().length === 0}
          data-testid="primary-add-items"
        >
          Add items
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
      {offline ? (
        <p className="mytab-type-meta" style={{ margin: "8px 0 0", textAlign: "center" }}>
          {STATE_COPY.needsConnection}
        </p>
      ) : null}
    </>
  );

  const showFooter = isOrganizer && !showSkeleton && !showEditor;
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

        {!showSkeleton && phase === "setup" && isOrganizer ? (
          <NewTabForm
            title={form.title}
            merchantName={form.merchantName}
            displayCurrency={form.displayCurrency}
            payerUserId={form.payerUserId}
            members={form.members}
            viewerUserId={viewerUserId}
            captureMethod={scanAvailable ? form.captureMethod : "manual"}
            scanAvailable={scanAvailable}
            fxFixtureBadge={form.fxFixtureBadge}
            onChange={handleFormChange}
          />
        ) : null}

        {!showSkeleton && phase === "items" ? (
          <>
            {showEditor && isOrganizer ? (
              <ItemEditor
                name={editorDraft.name}
                quantity={editorDraft.quantity}
                unitPriceBaht={editorDraft.unitPriceBaht}
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
                    <BillTotals lines={breakdown.lines} />
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}

        {!showSkeleton && !isOrganizer && phase === "setup" ? (
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
