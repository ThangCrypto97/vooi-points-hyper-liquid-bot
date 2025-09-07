import { useCallback } from "react";
import { registerAccount } from "~/helpers/registerAccount";
import { LOCAL_STORAGE_HYPERLIQUID_KEY } from "~/const/localStorageKeys";
import { useWalletClient } from "wagmi";
import type { ActiveAgent } from "~/types";

interface Props {
  setAgent: React.Dispatch<React.SetStateAction<ActiveAgent | null>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

export function LoginButton({ setAgent, setLoading }: Props) {
  const walletClient = useWalletClient().data;

  const login = useCallback(() => {
    if (walletClient?.account.address) {
      setLoading(true);
      try {
        (async () => {
          const activeAgent = await registerAccount();

          if (activeAgent) {
            localStorage.setItem(
              LOCAL_STORAGE_HYPERLIQUID_KEY,
              JSON.stringify(activeAgent)
            );
            setAgent(activeAgent);
            setLoading(false);
          }
        })();
      } catch (e) {
        localStorage.removeItem(LOCAL_STORAGE_HYPERLIQUID_KEY);
        setLoading(false);

        throw e;
      }
    }
  }, [walletClient?.account.address, setAgent, setLoading]);

  if (!walletClient?.account.address) {
    return null;
  }

  return <button onClick={login}>Vooi Login</button>;
}
