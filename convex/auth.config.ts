/**
 * Privy custom JWT auth stub (AD-5).
 * Filled in Story 1.5 with issuer, applicationID, algorithm, and JWKS data URI.
 */
export default {
  providers: [
    {
      type: "customJwt",
      applicationID: "<PRIVY_APP_ID>",
      issuer: "privy.io",
      jwks: "<base64-data-uri-jwks>",
      algorithm: "ES256",
    },
  ],
};
