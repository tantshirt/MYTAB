/**
 * Decimals come from the mint account or they do not count.
 *
 * These tests pin our hand-rolled decoder against @solana/spl-token's reference
 * layout, and then exercise the ways a mint-shaped read can lie: a token
 * account under Token-2022 that is long enough to look like an extended mint,
 * an uninitialised mint, an account owned by some other program, and the case
 * that actually loses money — a registry claiming different decimals than the
 * chain.
 */

import { describe, expect, it } from "vitest";
import { MintLayout, TOKEN_2022_PROGRAM_ID as SPL_TOKEN_2022, AccountLayout } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  MINT_ACCOUNT_SIZE,
  TOKEN_2022_ACCOUNT_TYPE_MINT,
  TOKEN_2022_ACCOUNT_TYPE_OFFSET,
  assertDecimalsMatchChain,
  decodeMintAccount,
  isMintAccountLength,
} from "../../lib/tokens/mintAccount";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "../../lib/solana/constants";
import { TOKEN_METADATA_FAILURE, TokenMetadataError } from "../../lib/tokens/types";

function encodeMint(input: {
  decimals: number;
  isInitialized?: boolean;
  mintAuthority?: PublicKey | null;
  freezeAuthority?: PublicKey | null;
}): string {
  const buffer = Buffer.alloc(MINT_ACCOUNT_SIZE);
  MintLayout.encode(
    {
      mintAuthorityOption: input.mintAuthority === null ? 0 : 1,
      mintAuthority: input.mintAuthority ?? PublicKey.default,
      supply: 0n,
      decimals: input.decimals,
      isInitialized: input.isInitialized ?? true,
      freezeAuthorityOption: input.freezeAuthority ? 1 : 0,
      freezeAuthority: input.freezeAuthority ?? PublicKey.default,
    },
    buffer,
  );
  return buffer.toString("base64");
}

const MINT_AUTHORITY = Keypair.generate().publicKey;
const FREEZE_AUTHORITY = Keypair.generate().publicKey;
const SOME_MINT = Keypair.generate().publicKey.toBase58();

describe("decodeMintAccount", () => {
  it("agrees with the reference SPL layout on every plausible decimals value", () => {
    for (let decimals = 0; decimals <= 18; decimals += 1) {
      const decoded = decodeMintAccount({
        dataBase64: encodeMint({ decimals, mintAuthority: MINT_AUTHORITY }),
        owner: TOKEN_PROGRAM_ID,
      });
      expect(decoded?.decimals).toBe(decimals);
    }
  });

  it("reads the authority options rather than assuming them", () => {
    const withBoth = decodeMintAccount({
      dataBase64: encodeMint({
        decimals: 6,
        mintAuthority: MINT_AUTHORITY,
        freezeAuthority: FREEZE_AUTHORITY,
      }),
      owner: TOKEN_PROGRAM_ID,
    });
    expect(withBoth?.mintAuthority).toBe(MINT_AUTHORITY.toBase58());
    expect(withBoth?.freezeAuthority).toBe(FREEZE_AUTHORITY.toBase58());

    const revoked = decodeMintAccount({
      dataBase64: encodeMint({ decimals: 6, mintAuthority: null }),
      owner: TOKEN_PROGRAM_ID,
    });
    expect(revoked?.mintAuthority).toBeNull();
    expect(revoked?.freezeAuthority).toBeNull();
  });

  it("rejects an account owned by anything but a token program", () => {
    expect(
      decodeMintAccount({
        dataBase64: encodeMint({ decimals: 6 }),
        owner: "11111111111111111111111111111111",
      }),
    ).toBeNull();
  });

  it("accepts a bare Token-2022 mint, which is byte-identical to a v1 mint", () => {
    const decoded = decodeMintAccount({
      dataBase64: encodeMint({ decimals: 9, mintAuthority: MINT_AUTHORITY }),
      owner: TOKEN_2022_PROGRAM_ID,
    });
    expect(decoded?.decimals).toBe(9);
    expect(decoded?.programId).toBe(TOKEN_2022_PROGRAM_ID);
    expect(SPL_TOKEN_2022.toBase58()).toBe(TOKEN_2022_PROGRAM_ID);
  });

  it("accepts an extended Token-2022 mint carrying the Mint discriminator", () => {
    const extended = Buffer.alloc(TOKEN_2022_ACCOUNT_TYPE_OFFSET + 8);
    Buffer.from(encodeMint({ decimals: 2, mintAuthority: MINT_AUTHORITY }), "base64").copy(
      extended,
    );
    extended[TOKEN_2022_ACCOUNT_TYPE_OFFSET] = TOKEN_2022_ACCOUNT_TYPE_MINT;

    const decoded = decodeMintAccount({
      dataBase64: extended.toString("base64"),
      owner: TOKEN_2022_PROGRAM_ID,
    });
    expect(decoded?.decimals).toBe(2);
  });

  it("refuses a Token-2022 *token account*, which is long enough to look extended", () => {
    // This is the trap the discriminator check exists for: without it, byte 44
    // of a token account (part of its owner pubkey) would be served as decimals.
    const account = Buffer.alloc(AccountLayout.span + 8);
    account[TOKEN_2022_ACCOUNT_TYPE_OFFSET] = 2; // AccountType::Account

    expect(
      decodeMintAccount({
        dataBase64: account.toString("base64"),
        owner: TOKEN_2022_PROGRAM_ID,
      }),
    ).toBeNull();
  });

  it("refuses a long buffer under the v1 program, which has no extensions", () => {
    const oversized = Buffer.alloc(TOKEN_2022_ACCOUNT_TYPE_OFFSET + 8);
    Buffer.from(encodeMint({ decimals: 6 }), "base64").copy(oversized);
    oversized[TOKEN_2022_ACCOUNT_TYPE_OFFSET] = TOKEN_2022_ACCOUNT_TYPE_MINT;

    expect(
      decodeMintAccount({
        dataBase64: oversized.toString("base64"),
        owner: TOKEN_PROGRAM_ID,
      }),
    ).toBeNull();
  });

  it("refuses a truncated buffer and unparseable base64", () => {
    expect(isMintAccountLength(81)).toBe(false);
    expect(isMintAccountLength(MINT_ACCOUNT_SIZE)).toBe(true);
    expect(isMintAccountLength(165)).toBe(false);
    expect(isMintAccountLength(166)).toBe(true);

    expect(
      decodeMintAccount({
        dataBase64: Buffer.alloc(64).toString("base64"),
        owner: TOKEN_PROGRAM_ID,
      }),
    ).toBeNull();
    expect(
      decodeMintAccount({ dataBase64: "not base64 ***", owner: TOKEN_PROGRAM_ID }),
    ).toBeNull();
  });
});

describe("assertDecimalsMatchChain", () => {
  it("returns the chain value when the registry agrees", () => {
    expect(
      assertDecimalsMatchChain({
        mint: SOME_MINT,
        claimedDecimals: 6,
        account: { dataBase64: encodeMint({ decimals: 6 }), owner: TOKEN_PROGRAM_ID },
      }),
    ).toBe(6);
  });

  it("rejects a registry that is wrong by a factor of a thousand", () => {
    let thrown: unknown;
    try {
      assertDecimalsMatchChain({
        mint: SOME_MINT,
        claimedDecimals: 6,
        account: { dataBase64: encodeMint({ decimals: 9 }), owner: TOKEN_PROGRAM_ID },
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(TokenMetadataError);
    expect((thrown as TokenMetadataError).code).toBe(
      TOKEN_METADATA_FAILURE.DECIMALS_MISMATCH,
    );
    expect((thrown as TokenMetadataError).mint).toBe(SOME_MINT);
  });

  it("rejects a mint that does not exist on chain", () => {
    expect(() =>
      assertDecimalsMatchChain({ mint: SOME_MINT, claimedDecimals: 6, account: null }),
    ).toThrow(TOKEN_METADATA_FAILURE.NOT_A_MINT);
  });

  it("rejects an uninitialised mint", () => {
    expect(() =>
      assertDecimalsMatchChain({
        mint: SOME_MINT,
        claimedDecimals: 6,
        account: {
          dataBase64: encodeMint({ decimals: 6, isInitialized: false }),
          owner: TOKEN_PROGRAM_ID,
        },
      }),
    ).toThrow(TOKEN_METADATA_FAILURE.NOT_A_MINT);
  });
});
