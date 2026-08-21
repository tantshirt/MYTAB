"use client";

const LAUNCH_COPY = "Getting your tab ready…";

export function LaunchSurface() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        background: "#F4F7FA",
        color: "#0A2038",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <p
        aria-label="My Tab"
        style={{
          margin: 0,
          fontSize: "34px",
          fontWeight: 600,
          letterSpacing: "-0.028em",
        }}
      >
        My Tab
      </p>

      <div
        role="progressbar"
        aria-label="Loading"
        style={{
          marginTop: "32px",
          width: "48px",
          height: "4px",
          borderRadius: "999px",
          background: "#DFE7EF",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: "40%",
            background: "#1E51D2",
            borderRadius: "999px",
            animation: "mytab-launch-indeterminate 1.2s ease-in-out infinite",
          }}
        />
      </div>

      <p
        style={{
          marginTop: "16px",
          fontSize: "15px",
          color: "#55677D",
        }}
      >
        {LAUNCH_COPY}
      </p>

      <style>{`
        @keyframes mytab-launch-indeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
      `}</style>
    </main>
  );
}

export const launchSurfaceCopy = LAUNCH_COPY;
