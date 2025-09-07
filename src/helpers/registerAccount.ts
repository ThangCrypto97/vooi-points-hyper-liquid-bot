import { getAccount } from "@wagmi/core";
import Decimal from "decimal.js-light";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { LOCAL_STORAGE_HYPERLIQUID_PENDING_KEY } from "~/const/localStorageKeys";
import { wagmiConfig } from "../config";
import { addAgent } from "./utils";
import { approveBuilderFee } from "./approveBuilderFee";
import { HYPERLIQUID_CONFIG } from "../config";
import { setReferrer } from "./setReferrer";
import { signTransaction } from "./signTransaction";
import type {
  ActiveAgent,
  PendingAgentData,
  ReferralInfo,
  UserNonFundingLedgerUpdate,
} from "../types";
import { hyperliquidFetch } from "./utils";

function serializeNonce(key: string, value: unknown) {
  if (key === "nonce") {
    return (value as bigint).toString() + "n";
  }

  return value;
}
function deserializeNonce(key: string, value: unknown) {
  if (key === "nonce") {
    return BigInt((value as string).slice(0, -1));
  }

  return value;
}

function getPendingAgent(address: string): PendingAgentData | null {
  const pendingAgentsData = localStorage.getItem(
    LOCAL_STORAGE_HYPERLIQUID_PENDING_KEY,
  );
  if (pendingAgentsData) {
    const pendingAgents = JSON.parse(pendingAgentsData, deserializeNonce);

    const agent = pendingAgents[address];

    if (
      agent &&
      agent["signedTransaction"] &&
      agent["privateKey"] &&
      agent["timestamp"]
    ) {
      return agent;
    }
  }

  return null;
}

export async function registerAccount(): Promise<ActiveAgent | null> {
  const { address, chainId } = getAccount(wagmiConfig);

  if (!address || !chainId) {
    throw new Error("No address or chainId");
  }

  let agent = getPendingAgent(address);
  if (!agent) {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const timestamp = Date.now();

    const signedTransaction = await signTransaction(
      "HyperliquidTransaction:ApproveAgent",
      {
        agentAddress: account.address,
        agentName: "VOOI", // Optional name for the API wallet
        nonce: BigInt(timestamp),
      },
    );

    agent = {
      signedTransaction,
      privateKey,
      timestamp,
    };
  }

  try {
    const deposits = await hyperliquidFetch<UserNonFundingLedgerUpdate[]>(
      "/info",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "userNonFundingLedgerUpdates",
          user: address,
        }),
      },
    );

    if (!deposits.length) {
      localStorage.setItem(
        LOCAL_STORAGE_HYPERLIQUID_PENDING_KEY,
        JSON.stringify(
          {
            [address]: agent,
          },
          serializeNonce,
        ),
      );

      return null;
    }

    const currentMaxBuilderFee = await hyperliquidFetch<number>("/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "maxBuilderFee",
        user: address,
        builder: HYPERLIQUID_CONFIG.builderId,
      }),
    });

    const maxBuilderFee = new Decimal(HYPERLIQUID_CONFIG.builderMaxFee).mul(
      10,
    );
    if (
      !currentMaxBuilderFee ||
      maxBuilderFee.greaterThan(currentMaxBuilderFee)
    ) {
      await approveBuilderFee();
    }
  } catch (error) {
    localStorage.removeItem(LOCAL_STORAGE_HYPERLIQUID_PENDING_KEY);

    throw error;
  }

  let activeAgent: ActiveAgent;
  try {
    const hyperliquidKey = await addAgent(agent);

    activeAgent = {
      address,
      privateKey: hyperliquidKey,
    };

    localStorage.removeItem(LOCAL_STORAGE_HYPERLIQUID_PENDING_KEY);
  } catch (error) {
    localStorage.removeItem(LOCAL_STORAGE_HYPERLIQUID_PENDING_KEY);

    throw error;
  }

  try {
    const referralInfo = await hyperliquidFetch<ReferralInfo>("/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "referral",
        user: address,
      }),
    });

    const requiredToTrade = new Decimal(
      referralInfo.referrerState.data.required,
    );

    if (!referralInfo.referredBy && requiredToTrade.gt(0)) {
      await setReferrer(activeAgent.privateKey);
    }
  } catch {
    // Nothing
  }

  return activeAgent;
}
