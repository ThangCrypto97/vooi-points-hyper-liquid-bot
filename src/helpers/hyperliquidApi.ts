import { type Hex, parseSignature } from "viem";
import { HYPERLIQUID_CONFIG } from "../config";

interface Params {
  action: Record<string, unknown>;
  nonce: number;
  signature: Hex;
}

interface Response {
  status: "ok" | "err";
  response: unknown;
}

export async function hyperliquidApi({
  action,
  signature,
  nonce,
}: Params): Promise<Response> {
  const structuredSignature = parseSignature(signature);

  const response = await fetch(`${HYPERLIQUID_CONFIG.apiUrl}/exchange`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action,
      isFrontend: true,
      nonce,
      signature: {
        r: structuredSignature.r,
        s: structuredSignature.s,
        v: Number(structuredSignature.v),
      },
      vaultAddress: null,
    }),
  });

  const json = await response.json();

  return json;
}
