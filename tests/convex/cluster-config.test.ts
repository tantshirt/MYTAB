/**
 * Cluster is configuration, not a constant.
 *
 * The devnet ship and the later mainnet flip must differ only in these values,
 * and it must be impossible to validate against one cluster's mint while
 * broadcasting to the other.
 */

import { describe, expect, it } from "vitest";
import {
  CLUSTER_FAILURE,
  ClusterConfigError,
  assertClusterRpcAgreement,
  getClusterConfig,
  inferClusterFromRpcUrl,
  resolveCluster,
  resolveDflowAggregatorProgramId,
  resolveUsdcMint,
} from "../../lib/solana/cluster";
import { DFLOW_FIXTURE_PROGRAM_ID } from "../../lib/dflow/constants";

describe("cluster resolution", () => {
  it("defaults to devnet — mainnet is never reached by omission", () => {
    expect(resolveCluster({})).toBe("devnet");
  });

  it("accepts the two supported clusters", () => {
    expect(resolveCluster({ SOLANA_CLUSTER: "devnet" })).toBe("devnet");
    expect(resolveCluster({ SOLANA_CLUSTER: "mainnet-beta" })).toBe("mainnet-beta");
    expect(resolveCluster({ SOLANA_CLUSTER: "mainnet" })).toBe("mainnet-beta");
  });

  it("fails closed on an unrecognised cluster", () => {
    expect(() => resolveCluster({ SOLANA_CLUSTER: "testnet" })).toThrow(
      ClusterConfigError,
    );
    expect(() => resolveCluster({ SOLANA_CLUSTER: "localnet" })).toThrow(
      /SOLANA_CLUSTER_UNKNOWN/,
    );
  });
});

describe("cluster-scoped values", () => {
  it("gives each cluster its own USDC mint", () => {
    const devnet = getClusterConfig("devnet");
    const mainnet = getClusterConfig("mainnet-beta");
    expect(devnet.usdcMint).toBe("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
    expect(mainnet.usdcMint).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    expect(devnet.usdcMint).not.toBe(mainnet.usdcMint);
    expect(devnet.usdcDecimals).toBe(6);
    expect(mainnet.usdcDecimals).toBe(6);
  });

  it("resolves the mint from the environment", () => {
    expect(resolveUsdcMint({ SOLANA_CLUSTER: "devnet" })).toBe(
      getClusterConfig("devnet").usdcMint,
    );
    expect(resolveUsdcMint({ SOLANA_CLUSTER: "mainnet-beta" })).toBe(
      getClusterConfig("mainnet-beta").usdcMint,
    );
  });

  it("reads the DFlow aggregator program id from config on both clusters", () => {
    const devnet = resolveDflowAggregatorProgramId({ SOLANA_CLUSTER: "devnet" });
    const mainnet = resolveDflowAggregatorProgramId({
      SOLANA_CLUSTER: "mainnet-beta",
    });
    expect(devnet).toBe("DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH");
    expect(mainnet).toBe(devnet);
    // A fixture placeholder is never a cluster variant.
    expect(devnet).not.toBe(DFLOW_FIXTURE_PROGRAM_ID);
  });

  it("keeps wrapped SOL identical across clusters", () => {
    expect(getClusterConfig("devnet").wrappedSolMint).toBe(
      getClusterConfig("mainnet-beta").wrappedSolMint,
    );
  });
});

describe("RPC / cluster agreement", () => {
  it.each([
    ["https://api.devnet.solana.com", "devnet"],
    ["https://api.mainnet-beta.solana.com", "mainnet-beta"],
    ["https://devnet.helius-rpc.com/?api-key=x", "devnet"],
    ["https://mainnet.helius-rpc.com/?api-key=x", "mainnet-beta"],
  ] as const)("infers %s as %s", (url, expected) => {
    expect(inferClusterFromRpcUrl(url)).toBe(expected);
  });

  it("infers nothing from an opaque host", () => {
    expect(inferClusterFromRpcUrl("https://rpc.example.com")).toBeUndefined();
    expect(inferClusterFromRpcUrl("not a url")).toBeUndefined();
  });

  it("accepts a matching pair", () => {
    expect(
      assertClusterRpcAgreement({
        SOLANA_CLUSTER: "devnet",
        SOLANA_RPC_URL: "https://api.devnet.solana.com",
      }),
    ).toEqual({ cluster: "devnet", rpcUrl: "https://api.devnet.solana.com" });
  });

  it("rejects a devnet mint validated against a mainnet RPC", () => {
    // The exact scenario the coordinator called out: a "test" transaction that
    // ends up spending real sponsor SOL.
    expect(() =>
      assertClusterRpcAgreement({
        SOLANA_CLUSTER: "devnet",
        SOLANA_RPC_URL: "https://api.mainnet-beta.solana.com",
      }),
    ).toThrow(new RegExp(CLUSTER_FAILURE.RPC_MISMATCH));
  });

  it("rejects a mainnet config pointed at a devnet RPC", () => {
    expect(() =>
      assertClusterRpcAgreement({
        SOLANA_CLUSTER: "mainnet-beta",
        SOLANA_RPC_URL: "https://api.devnet.solana.com",
      }),
    ).toThrow(new RegExp(CLUSTER_FAILURE.RPC_MISMATCH));
  });

  it("refuses to guess when the RPC host carries no marker", () => {
    expect(() =>
      assertClusterRpcAgreement({
        SOLANA_CLUSTER: "devnet",
        SOLANA_RPC_URL: "https://rpc.example.com",
      }),
    ).toThrow(new RegExp(CLUSTER_FAILURE.RPC_UNVERIFIED));
  });

  it("accepts an opaque host once the operator declares its cluster", () => {
    expect(
      assertClusterRpcAgreement({
        SOLANA_CLUSTER: "devnet",
        SOLANA_RPC_URL: "https://rpc.example.com",
        SOLANA_RPC_CLUSTER: "devnet",
      }).cluster,
    ).toBe("devnet");
  });

  it("rejects a declaration that contradicts the host", () => {
    expect(() =>
      assertClusterRpcAgreement({
        SOLANA_CLUSTER: "devnet",
        SOLANA_RPC_URL: "https://api.mainnet-beta.solana.com",
        SOLANA_RPC_CLUSTER: "devnet",
      }),
    ).toThrow(new RegExp(CLUSTER_FAILURE.RPC_MISMATCH));
  });

  it("requires an RPC endpoint at all", () => {
    expect(() => assertClusterRpcAgreement({ SOLANA_CLUSTER: "devnet" })).toThrow(
      new RegExp(CLUSTER_FAILURE.RPC_UNVERIFIED),
    );
  });
});
