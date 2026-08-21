import { shouldShowNonProductionBadge } from "@/lib/env/preview-guard";

type NonProductionBadgeProps = {
  env?: Parameters<typeof shouldShowNonProductionBadge>[0];
};

export function NonProductionBadge({ env }: NonProductionBadgeProps) {
  if (!shouldShowNonProductionBadge(env)) {
    return null;
  }

  return (
    <div
      role="status"
      aria-label="Non-production environment"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: "4px 12px",
        background: "#b45309",
        color: "#fffbeb",
        fontFamily: "system-ui, sans-serif",
        fontSize: "12px",
        fontWeight: 600,
        textAlign: "center",
        letterSpacing: "0.02em",
      }}
    >
      NON-PRODUCTION
    </div>
  );
}
