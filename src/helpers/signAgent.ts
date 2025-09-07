import { encode } from "@msgpack/msgpack";
import { type Hex, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { HYPERLIQUID_CONFIG } from "../config";

interface SignAgentParams {
  action: Record<string, unknown>;
  nonce: number;
  privateKey: Hex;
  vaultAddress: string | null;
}

interface HashAgentParams {
  action: Record<string, unknown>;
  vaultAddress: string | null;
  nonce: number;
}

const DOMAIN = {
  chainId: 1337n,
  name: "Exchange",
  verifyingContract: "0x0000000000000000000000000000000000000000",
  version: "1",
} as const;

const TYPES = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  Agent: [
    { name: "source", type: "string" },
    { name: "connectionId", type: "bytes32" },
  ],
} as const;

export async function signAgent({
  action,
  nonce,
  privateKey,
  vaultAddress,
}: SignAgentParams): Promise<Hex> {
  const account = privateKeyToAccount(privateKey);

  const message = {
    source: HYPERLIQUID_CONFIG.source,
    connectionId: hashAction({ action, vaultAddress, nonce }),
  };

  const signature = await account.signTypedData({
    domain: DOMAIN,
    message,
    primaryType: "Agent",
    types: TYPES,
  });

  return signature;
}

function hashAction({ action, vaultAddress, nonce }: HashAgentParams): Hex {
  let data = encode(action);

  data = concatUint8Array(data, toBytes(nonce, { size: 8 }));

  if (!vaultAddress) {
    data = concatUint8Array(data, toBytes("0x00"));
  } else {
    data = concatUint8Array(data, toBytes("0x01"));
    data = concatUint8Array(data, toBytes(vaultAddress));
  }

  return keccak256(data);
}

function concatUint8Array(left: Uint8Array, right: Uint8Array): Uint8Array {
  const result = new Uint8Array(left.length + right.length);

  result.set(left);
  result.set(right, left.length);

  return result;
}
