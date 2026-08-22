/**
 * The badge beside the currency pair on New Tab.
 *
 * It names the *rate*, not the data: off mainnet the THB→USDC rate comes from
 * `lib/domain/fxFixture`, a fixed published rate rather than a live quote, and
 * the person is told so on the surface rather than being shown a number that
 * looks live. This is a label about a real mechanism, not seeded content.
 */
export const FX_FIXTURE_BADGE = "Fixture rate";
