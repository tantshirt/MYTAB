"use client";

import { MYTAB_COLORS } from "@/lib/theme/tokens";
import type { BillMemberOption } from "./fixtures";

export type NewTabFormProps = {
  title: string;
  merchantName: string;
  displayCurrency: string;
  recipientAsset: string;
  payerUserId: string;
  recipientUserId: string;
  members: BillMemberOption[];
  fxFixtureBadge?: string;
  onChange: (patch: Partial<NewTabFormProps>) => void;
};

/** New Tab setup — title, currency, payer, recipient (Story 4.1). */
export function NewTabForm({
  title,
  merchantName,
  displayCurrency,
  recipientAsset,
  payerUserId,
  recipientUserId,
  members,
  fxFixtureBadge,
  onChange,
}: NewTabFormProps) {
  const walletReadyMembers = members.filter((member) => member.walletReady);

  return (
    <section className="mytab-card" style={{ padding: "20px" }} data-testid="new-tab-form">
      <label className="mytab-type-micro-label" htmlFor="tab-title">
        Tab name
      </label>
      <input
        id="tab-title"
        value={title}
        onChange={(event) => onChange({ title: event.target.value })}
        className="mytab-input"
        style={{ width: "100%", marginTop: 8, marginBottom: 16 }}
      />

      <label className="mytab-type-micro-label" htmlFor="tab-merchant">
        Merchant
      </label>
      <input
        id="tab-merchant"
        value={merchantName}
        onChange={(event) => onChange({ merchantName: event.target.value })}
        className="mytab-input"
        style={{ width: "100%", marginTop: 8, marginBottom: 16 }}
      />

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <p className="mytab-type-micro-label">Currency</p>
          <p className="mytab-type-body" style={{ margin: "8px 0 0" }}>
            {displayCurrency}
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <p className="mytab-type-micro-label">Recipient asset</p>
          <p className="mytab-type-body" style={{ margin: "8px 0 0" }}>
            {recipientAsset}
          </p>
        </div>
      </div>

      {fxFixtureBadge ? (
        <p
          className="mytab-type-meta"
          style={{ marginBottom: 16, color: MYTAB_COLORS.warning }}
          data-testid="fx-fixture-badge"
        >
          {fxFixtureBadge}
        </p>
      ) : null}

      <label className="mytab-type-micro-label" htmlFor="tab-payer">
        Payer
      </label>
      <select
        id="tab-payer"
        value={payerUserId}
        onChange={(event) => onChange({ payerUserId: event.target.value })}
        className="mytab-input"
        style={{ width: "100%", marginTop: 8, marginBottom: 16 }}
      >
        {members.map((member) => (
          <option key={member.userId} value={member.userId}>
            {member.displayName}
          </option>
        ))}
      </select>

      <label className="mytab-type-micro-label" htmlFor="tab-recipient">
        Recipient
      </label>
      <select
        id="tab-recipient"
        value={recipientUserId}
        onChange={(event) => onChange({ recipientUserId: event.target.value })}
        className="mytab-input"
        style={{ width: "100%", marginTop: 8 }}
      >
        {walletReadyMembers.map((member) => (
          <option key={member.userId} value={member.userId}>
            {member.displayName}
          </option>
        ))}
      </select>
      <p className="mytab-type-meta" style={{ marginTop: 8, color: MYTAB_COLORS.inkMuted }}>
        Receiving wallet is resolved when the tab is locked — not shown here.
      </p>
    </section>
  );
}
