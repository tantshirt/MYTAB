import type { ReactNode } from "react";
import { shouldShowNonProductionBadge } from "@/lib/env/preview-guard";
import { NonProductionBadge } from "@/components/primitives/non-production-badge";
import { Providers } from "./providers";

export const metadata = {
  title: "My Tab",
  description: "The group tab that lives in Telegram.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const showBadge = shouldShowNonProductionBadge();

  return (
    <html lang="en">
      <body>
        {showBadge ? <NonProductionBadge /> : null}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
