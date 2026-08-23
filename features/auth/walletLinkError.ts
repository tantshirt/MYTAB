export class WalletLinkClientError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "WalletLinkClientError";
  }
}
