"use client";

import { CopyGlyph } from "@/components/primitives/glyphs";
import { ListRow } from "@/components/primitives/list-row";
import { MYTAB_COLORS } from "@/lib/theme/tokens";
import { YOU_COPY } from "./copy";
import { elideWalletKey, useCopyKey } from "./useCopyKey";

export type WalletKeyRowProps = {
  label: string;
  publicKey: string;
  /** Sub line while idle. Omit in the sheet, where the full key is already shown above. */
  idleValue?: string;
  ariaLabel: string;
};

/**
 * Tapping anywhere on the row copies the full key; the value line confirms in place
 * for 1600ms and reverts. No toast (POLISH-SPEC §3.2).
 */
export function WalletKeyRow({ label, publicKey, idleValue, ariaLabel }: WalletKeyRowProps) {
  const { status, copy } = useCopyKey();

  const sub =
    status === "copied"
      ? YOU_COPY.copied
      : status === "failed"
        ? YOU_COPY.copyFailed
        : idleValue;

  return (
    <div>
      <ListRow
        label={label}
        sub={sub}
        subColor={status === "copied" ? MYTAB_COLORS.settled : MYTAB_COLORS.inkMuted}
        subMonospace={status === "idle" && idleValue !== undefined}
        subSelectable={status === "failed"}
        ariaLabel={ariaLabel}
        onPress={() => copy(publicKey)}
        trailing={<CopyGlyph />}
      />
      <span role="status" aria-live="polite" className="mytab-visually-hidden">
        {status === "copied" ? YOU_COPY.copied : ""}
      </span>
    </div>
  );
}
