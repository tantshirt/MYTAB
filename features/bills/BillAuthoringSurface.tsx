"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { computeBillBreakdown } from "@/lib/domain/bill";
import { formatFiatMinorThb } from "@/lib/domain/format";
import { fiatMinorFromInteger } from "@/lib/domain/money";
import { isConvexAuthFixtureMode } from "@/lib/privy/config";
import { MYTAB_COLORS } from "@/lib/theme/tokens";
import { AdjustmentsPanel } from "./AdjustmentsPanel";
import { BillEmptyState } from "./BillEmptyState";
import { BillSkeleton } from "./BillSkeleton";
import { BillTotals } from "./BillTotals";
import { bahtToMinor, ItemEditor, minorToBaht } from "./ItemEditor";
import { ItemRow } from "./ItemRow";
import { NewTabForm } from "./NewTabForm";
import { OfflineBar } from "./OfflineBar";
import {
  FIXTURE_BILL_AUTHORING,
  FIXTURE_EMPTY_BILL,
  type BillAuthoringFixture,
  type BillItemView,
} from "./fixtures";

export type BillAuthoringSurfaceProps = {
  tabId: string;
  tabTitle?: string;
  viewerUserId?: string;
  fixture?: BillAuthoringFixture;
};

type AuthorPhase = "setup" | "items";

type LoadState = "initial" | "ready";

/** Full tab authoring surface — Epic 4 stories 4.1–4.4. */
export function BillAuthoringSurface({
  tabId,
  tabTitle,
  viewerUserId,
  fixture,
}: BillAuthoringSurfaceProps) {
  const resolvedFixture = fixture ?? (isConvexAuthFixtureMode() ? FIXTURE_BILL_AUTHORING : null);
  const [loadState, setLoadState] = useState<LoadState>(() =>
    resolvedFixture ? "ready" : "initial",
  );
  const [phase, setPhase] = useState<AuthorPhase>(() =>
    resolvedFixture?.items.length ? "items" : "setup",
  );
  const [offline, setOffline] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const hasLoadedOnce = useRef(false);

  const [form, setForm] = useState(() => ({
    title: resolvedFixture?.title ?? tabTitle ?? "New tab",
    merchantName: resolvedFixture?.merchantName ?? "",
    displayCurrency: resolvedFixture?.displayCurrency ?? "THB",
    recipientAsset: resolvedFixture?.recipientAsset ?? "USDC",
    payerUserId: resolvedFixture?.payerUserId ?? viewerUserId ?? "",
    recipientUserId: resolvedFixture?.recipientUserId ?? "",
    members: resolvedFixture?.members ?? [],
    organizerDisplayName: resolvedFixture?.organizerDisplayName ?? "Organizer",
    fxFixtureBadge: resolvedFixture?.fxFixtureBadge,
  }));

  const [items, setItems] = useState<BillItemView[]>(resolvedFixture?.items ?? []);
  const [adjustments, setAdjustments] = useState(resolvedFixture?.adjustments ?? []);
  const [editorDraft, setEditorDraft] = useState({
    name: "",
    quantity: 1,
    unitPriceBaht: 0,
  });

  const isOrganizer =
    viewerUserId != null
      ? viewerUserId === (resolvedFixture?.organizerUserId ?? viewerUserId)
      : isConvexAuthFixtureMode();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoadState("ready");
      hasLoadedOnce.current = true;
      if (resolvedFixture?.items.length) {
        setPhase("items");
      }
    }, resolvedFixture ? 0 : 120);
    return () => window.clearTimeout(timer);
  }, [resolvedFixture]);

  useEffect(() => {
    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

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

  const handleFormChange = useCallback((patch: Partial<typeof form>) => {
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
    const unitPriceMinor = bahtToMinor(editorDraft.unitPriceBaht);
    const lineTotalMinor = unitPriceMinor * editorDraft.quantity;

    if (editingItemId) {
      setItems((current) =>
        current.map((item) =>
          item._id === editingItemId
            ? {
                ...item,
                name: editorDraft.name.trim(),
                quantity: editorDraft.quantity,
                unitPriceMinor,
                lineTotalMinor,
              }
            : item,
        ),
      );
    } else {
      setItems((current) => [
        ...current,
        {
          _id: `items:${current.length + 1}`,
          name: editorDraft.name.trim(),
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
      return [
        ...current,
        {
          ...source,
          _id: `items:${current.length + 1}`,
        },
      ];
    });
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setItems((current) => current.filter((item) => item._id !== itemId));
  }, []);

  const primaryAction =
    phase === "setup" ? (
      <button
        type="button"
        className="mytab-button-primary"
        style={{ width: "100%" }}
        onClick={() => setPhase("items")}
        data-testid="primary-add-items"
      >
        Add items
      </button>
    ) : (
      <button
        type="button"
        className="mytab-button-primary"
        style={{ width: "100%" }}
        onClick={openNewItemEditor}
        data-testid="primary-add-item"
      >
        Add item
      </button>
    );

  const showSkeleton = loadState === "initial" && !hasLoadedOnce.current;

  return (
    <>
      <OfflineBar visible={offline} />
      {/* Authoring keeps the tab bar. Only the deep-linked Claim Board hides it
          (EXPERIENCE, Information Architecture; POLISH-SPEC §1.0). */}
      <AppShell footer={isOrganizer ? primaryAction : undefined}>
        <header style={{ paddingTop: 8, paddingBottom: 16 }}>
          <h1 className="mytab-type-title" style={{ margin: 0 }}>
            {form.title}
          </h1>
          {form.merchantName ? (
            <p className="mytab-type-meta" style={{ marginTop: 8 }}>
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
            recipientAsset={form.recipientAsset}
            payerUserId={form.payerUserId}
            recipientUserId={form.recipientUserId}
            members={form.members}
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
                onScanReceipt={() => undefined}
              />
            ) : null}

            {!showEditor && items.length > 0 ? (
              <section className="mytab-card" style={{ padding: "8px 20px 12px" }}>
                {items.map((item) => (
                  <ItemRow
                    key={item._id}
                    item={item}
                    editable={isOrganizer}
                    onEdit={openEditItem}
                    onDuplicate={duplicateItem}
                    onRemove={removeItem}
                  />
                ))}
              </section>
            ) : null}

            {!showEditor && items.length > 0 ? (
              <>
                <div style={{ marginTop: 16 }}>
                  <AdjustmentsPanel
                    adjustments={adjustments}
                    editable={isOrganizer}
                  />
                </div>
                {breakdown ? (
                  <div style={{ marginTop: 16 }}>
                    <BillTotals lines={breakdown.lines} />
                  </div>
                ) : (
                  <section className="mytab-card" style={{ padding: 20, marginTop: 16 }}>
                    <p className="mytab-type-amount-md mytab-tabular" data-mytab-amount style={{ margin: 0 }}>
                      {formatFiatMinorThb(fiatMinorFromInteger(items.reduce((sum, item) => sum + item.lineTotalMinor, 0)))}
                    </p>
                  </section>
                )}
              </>
            ) : null}
          </>
        ) : null}

        {!showSkeleton && !isOrganizer && phase === "setup" ? (
          <BillEmptyState
            isOrganizer={false}
            organizerDisplayName={form.organizerDisplayName}
          />
        ) : null}

        {resolvedFixture && tabId ? (
          <p className="mytab-type-meta" style={{ marginTop: 24, color: MYTAB_COLORS.inkMuted }}>
            Fixture tab · {tabId}
          </p>
        ) : null}
      </AppShell>
    </>
  );
}

export { FIXTURE_BILL_AUTHORING, FIXTURE_EMPTY_BILL };
