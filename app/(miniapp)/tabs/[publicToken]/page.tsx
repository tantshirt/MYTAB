import { TabDeepLinkSurface } from "@/features/tabs/TabDeepLinkSurface";

type TabPageProps = {
  params: Promise<{ publicToken: string }>;
};

export default async function TabPage({ params }: TabPageProps) {
  const { publicToken } = await params;
  return <TabDeepLinkSurface publicToken={publicToken} />;
}
