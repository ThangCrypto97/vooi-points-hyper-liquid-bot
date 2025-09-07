import {
  getAccount,
  signTypedData,
  type SignTypedDataParameters,
} from "@wagmi/core";
import { numberToHex } from "viem";
import { HYPERLIQUID_CONFIG, wagmiConfig } from "../config";

type DistributiveOmit<T, K extends keyof T> = T extends unknown
  ? Omit<T, K>
  : never;

const DOMAIN = {
  name: "HyperliquidSignTransaction",
  version: "1",
  chainId: HYPERLIQUID_CONFIG.chainId,
  verifyingContract: "0x0000000000000000000000000000000000000000" as const,
};

const MESSAGE_TYPES = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  "HyperliquidTransaction:ApproveAgent": [
    { name: "hyperliquidChain", type: "string" },
    { name: "agentAddress", type: "address" },
    { name: "agentName", type: "string" },
    { name: "nonce", type: "uint64" },
  ],
  "HyperliquidTransaction:UsdSend": [
    { name: "hyperliquidChain", type: "string" },
    { name: "destination", type: "string" },
    { name: "amount", type: "string" },
    { name: "time", type: "uint64" },
  ],
  "HyperliquidTransaction:ApproveBuilderFee": [
    { name: "hyperliquidChain", type: "string" },
    { name: "maxFeeRate", type: "string" },
    { name: "builder", type: "address" },
    { name: "nonce", type: "uint64" },
  ],
} as const;

export async function signTransaction(
  type: Exclude<keyof typeof MESSAGE_TYPES, "EIP712Domain">,
  data: DistributiveOmit<
    SignTypedDataParameters<typeof MESSAGE_TYPES, typeof type>["message"],
    "hyperliquidChain"
  >,
) {
  const { address, chainId } = getAccount(wagmiConfig);

  if (!address || !chainId) {
    throw new Error("No address or chainId");
  }

  const message = {
    ...data,
    hyperliquidChain: HYPERLIQUID_CONFIG.hyperliquidChain,
  };

  const types = { [type]: MESSAGE_TYPES[type] } as const;

  const signature = await signTypedData(wagmiConfig, {
    account: address,
    domain: DOMAIN,
    message,
    primaryType: type,
    types,
  });

  return {
    action: {
      ...message,
      signatureChainId: numberToHex(HYPERLIQUID_CONFIG.chainId),
    },
    signature,
  };
}
