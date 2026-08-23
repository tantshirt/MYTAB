import { describe, expect, it, vi } from "vitest";
import { bytesToBase64 } from "@/lib/crypto/convexCrypto";
import {
  SIGN_AND_SUBMIT_FAILURE,
  SignAndSubmitError,
  signAndSubmitPreparedIntent,
} from "@/lib/wallet/signAndSubmit";

describe("signAndSubmitPreparedIntent", () => {
  const prepared = bytesToBase64(new Uint8Array([1, 2, 3, 4]));

  it("submits the signed bytes and never invents success", async () => {
    const submit = vi.fn(async () => ({ intentId: "intents:1", status: "user_signed" }));
    const result = await signAndSubmitPreparedIntent({
      intentId: "intents:1",
      preparedTxBase64: prepared,
      signTransaction: async (bytes) => new Uint8Array([...bytes, 9]),
      submit,
    });
    expect(result).toEqual({ intentId: "intents:1", status: "user_signed" });
    expect(submit).toHaveBeenCalledOnce();
  });

  it("fails closed on an empty signature", async () => {
    await expect(
      signAndSubmitPreparedIntent({
        intentId: "intents:1",
        preparedTxBase64: prepared,
        signTransaction: async () => new Uint8Array(),
        submit: async () => ({ intentId: "intents:1", status: "user_signed" }),
      }),
    ).rejects.toMatchObject({ code: SIGN_AND_SUBMIT_FAILURE.EMPTY_SIGNATURE });
  });

  it("fails closed when the wallet refuses to sign", async () => {
    await expect(
      signAndSubmitPreparedIntent({
        intentId: "intents:1",
        preparedTxBase64: prepared,
        signTransaction: async () => {
          throw new Error("user dismissed");
        },
        submit: async () => ({ intentId: "intents:1", status: "user_signed" }),
      }),
    ).rejects.toBeInstanceOf(SignAndSubmitError);
  });
});
