type FetchAccessTokenArgs = {
  forceRefreshToken: boolean;
};

type GetAccessToken = (options?: {
  disableAutoRefresh?: boolean;
}) => Promise<string | null>;

/**
 * Adapts Privy `getAccessToken()` to the ConvexProviderWithAuth fetch contract.
 */
export function createPrivyConvexAuthAdapter(
  getAccessToken: GetAccessToken,
): (args: FetchAccessTokenArgs) => Promise<string | null> {
  return async ({ forceRefreshToken }) => {
    try {
      return await getAccessToken(
        forceRefreshToken ? { disableAutoRefresh: false } : undefined,
      );
    } catch {
      return null;
    }
  };
}
