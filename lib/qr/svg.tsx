import { encodeQrModules } from "./encode";

export type QrSvgProps = {
  value: string;
  /** CSS pixels. The SVG scales; modules stay square. */
  size?: number;
  label?: string;
};

/**
 * Renders a QR as an SVG. Quiet zone of 4 modules. Dark modules use ink, not
 * a fill that would hide a figure — this surface carries no amount.
 */
export function QrSvg({ value, size = 196, label = "Invite code" }: QrSvgProps) {
  const modules = encodeQrModules(value);
  const dim = modules.length;
  const quiet = 4;
  const view = dim + quiet * 2;
  const rects: string[] = [];
  for (let r = 0; r < dim; r += 1) {
    for (let c = 0; c < dim; c += 1) {
      if (modules[r]![c]) {
        rects.push(`<rect x="${c + quiet}" y="${r + quiet}" width="1" height="1"/>`);
      }
    }
  }

  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${view} ${view}`}
      style={{ display: "block", width: size, height: size, flex: "none" }}
    >
      <rect width={view} height={view} fill="#FFFFFF" />
      <g fill="#0A2038">{/* ink — MYTAB_COLORS.ink, inlined so this file stays a leaf */}</g>
      <g fill="#0A2038" dangerouslySetInnerHTML={{ __html: rects.join("") }} />
    </svg>
  );
}
