/**
 * Wallet-standard detection without adding @wallet-standard/* (D-28).
 * Duck-types the register-wallet event and the three named window injections.
 */

import {
  providerFromWalletName,
  type ExternalWalletProvider,
  type NamedWalletProvider,
} from "./providers";

export type StandardWalletAccount = {
  address: string;
  publicKey: Uint8Array;
};

export type DetectedStandardWallet = {
  name: string;
  provider: ExternalWalletProvider;
  connect: () => Promise<StandardWalletAccount>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  signTransaction: (transaction: Uint8Array) => Promise<Uint8Array>;
};

type WindowSolana = {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  publicKey?: { toBase58?: () => string; toString?: () => string };
  connect?: () => Promise<{ publicKey?: { toBase58?: () => string; toString?: () => string } }>;
  signMessage?: (
    message: Uint8Array,
    encoding?: string,
  ) => Promise<{ signature: Uint8Array } | Uint8Array>;
  signTransaction?: (transaction: unknown) => Promise<{ serialize: () => Uint8Array } | Uint8Array>;
};

type WalletStandardWallet = {
  name?: string;
  accounts?: Array<{ address?: string; publicKey?: Uint8Array }>;
  features?: Record<string, unknown>;
};

function addressFromPublicKey(value: { toBase58?: () => string; toString?: () => string } | undefined): string | null {
  if (!value) {
    return null;
  }
  if (typeof value.toBase58 === "function") {
    return value.toBase58();
  }
  if (typeof value.toString === "function") {
    const asString = value.toString();
    return asString && asString !== "[object Object]" ? asString : null;
  }
  return null;
}

function wrapInjected(name: string, injected: WindowSolana): DetectedStandardWallet {
  return {
    name,
    provider: providerFromWalletName(name),
    connect: async () => {
      if (typeof injected.connect === "function") {
        const result = await injected.connect();
        const address =
          addressFromPublicKey(result?.publicKey) ?? addressFromPublicKey(injected.publicKey);
        if (!address) {
          throw new Error("WALLET_CONNECT_FAILED");
        }
        return { address, publicKey: new Uint8Array() };
      }
      const address = addressFromPublicKey(injected.publicKey);
      if (!address) {
        throw new Error("WALLET_CONNECT_FAILED");
      }
      return { address, publicKey: new Uint8Array() };
    },
    signMessage: async (message) => {
      if (typeof injected.signMessage !== "function") {
        throw new Error("WALLET_SIGN_UNSUPPORTED");
      }
      const result = await injected.signMessage(message, "utf8");
      if (result instanceof Uint8Array) {
        return result;
      }
      return result.signature;
    },
    signTransaction: async (transaction) => {
      if (typeof injected.signTransaction !== "function") {
        throw new Error("WALLET_SIGN_UNSUPPORTED");
      }
      const result = await injected.signTransaction(transaction);
      if (result instanceof Uint8Array) {
        return result;
      }
      return result.serialize();
    },
  };
}

function wrapStandardWallet(wallet: WalletStandardWallet): DetectedStandardWallet | null {
  const name = typeof wallet.name === "string" ? wallet.name : "";
  const features = wallet.features ?? {};
  const connectFeature = features["standard:connect"] as
    | { connect?: () => Promise<{ accounts?: Array<{ address?: string; publicKey?: Uint8Array }> }> }
    | undefined;
  const signMessageFeature = features["solana:signMessage"] as
    | {
        signMessage?: (input: {
          account: unknown;
          message: Uint8Array;
        }) => Promise<Array<{ signature: Uint8Array }>>;
      }
    | undefined;
  const signTxFeature = features["solana:signTransaction"] as
    | {
        signTransaction?: (input: {
          account: unknown;
          transaction: Uint8Array;
        }) => Promise<Array<{ signedTransaction: Uint8Array }>>;
      }
    | undefined;

  if (!name) {
    return null;
  }

  return {
    name,
    provider: providerFromWalletName(name),
    connect: async () => {
      const accounts =
        (await connectFeature?.connect?.())?.accounts ?? wallet.accounts ?? [];
      const account = accounts[0];
      if (!account?.address) {
        throw new Error("WALLET_CONNECT_FAILED");
      }
      return {
        address: account.address,
        publicKey: account.publicKey ?? new Uint8Array(),
      };
    },
    signMessage: async (message) => {
      const account = wallet.accounts?.[0];
      if (!signMessageFeature?.signMessage || !account) {
        throw new Error("WALLET_SIGN_UNSUPPORTED");
      }
      const [output] = await signMessageFeature.signMessage({ account, message });
      if (!output?.signature) {
        throw new Error("WALLET_SIGN_UNSUPPORTED");
      }
      return output.signature;
    },
    signTransaction: async (transaction) => {
      const account = wallet.accounts?.[0];
      if (!signTxFeature?.signTransaction || !account) {
        throw new Error("WALLET_SIGN_UNSUPPORTED");
      }
      const [output] = await signTxFeature.signTransaction({ account, transaction });
      if (!output?.signedTransaction) {
        throw new Error("WALLET_SIGN_UNSUPPORTED");
      }
      return output.signedTransaction;
    },
  };
}

function collectInjected(): DetectedStandardWallet[] {
  if (typeof window === "undefined") {
    return [];
  }
  const w = window as Window & {
    phantom?: { solana?: WindowSolana };
    solflare?: WindowSolana;
    backpack?: WindowSolana;
    solana?: WindowSolana;
  };
  const found: DetectedStandardWallet[] = [];
  if (w.phantom?.solana) {
    found.push(wrapInjected("Phantom", w.phantom.solana));
  }
  if (w.solflare) {
    found.push(wrapInjected("Solflare", w.solflare));
  }
  if (w.backpack) {
    found.push(wrapInjected("Backpack", w.backpack));
  }
  if (w.solana && !w.solana.isPhantom && !w.solana.isSolflare && !w.solana.isBackpack) {
    found.push(wrapInjected("Solana", w.solana));
  }
  return found;
}

function collectWalletStandard(): DetectedStandardWallet[] {
  if (typeof window === "undefined") {
    return [];
  }
  const wallets: WalletStandardWallet[] = [];
  const accept = (wallet: WalletStandardWallet) => {
    wallets.push(wallet);
  };
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ register?: (cb: (wallet: WalletStandardWallet) => void) => void }>)
      .detail;
    detail?.register?.(accept);
  };
  window.addEventListener("wallet-standard:register-wallet", listener);
  window.dispatchEvent(
    new CustomEvent("wallet-standard:app-ready", {
      detail: { register: accept },
    }),
  );
  window.removeEventListener("wallet-standard:register-wallet", listener);
  return wallets.map(wrapStandardWallet).filter((wallet): wallet is DetectedStandardWallet => wallet !== null);
}

/** Detect injected + wallet-standard wallets. Empty on iOS Telegram WebView (U-10). */
export function detectStandardWallets(): DetectedStandardWallet[] {
  const byName = new Map<string, DetectedStandardWallet>();
  for (const wallet of [...collectWalletStandard(), ...collectInjected()]) {
    if (!byName.has(wallet.name)) {
      byName.set(wallet.name, wallet);
    }
  }
  return [...byName.values()];
}

export function findNamedWallet(
  wallets: readonly DetectedStandardWallet[],
  provider: NamedWalletProvider,
): DetectedStandardWallet | undefined {
  return wallets.find((wallet) => wallet.provider === provider);
}
