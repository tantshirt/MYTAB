type TabPageProps = {
  params: Promise<{ publicToken: string }>;
};

export default async function TabPage({ params }: TabPageProps) {
  const { publicToken } = await params;

  return (
    <main style={{ padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "20px", fontWeight: 600 }}>Tab</h1>
      <p style={{ color: "#57534e" }}>Token: {publicToken}</p>
    </main>
  );
}
