import { ConnectButton, useConnectModal } from "@rainbow-me/rainbowkit";

export function ConnectWalletButton() {
  const { openConnectModal } = useConnectModal();

  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === "authenticated");

        let text = "Connect Wallet";
        if (chain?.unsupported) {
          text = "Change network";
        } else if (account?.address) {
          text = account?.address;
        }

        const onClick = () => {
          if (!connected || !ready) {
            openConnectModal?.();
            return;
          }

          if (chain.unsupported) {
            openChainModal();
            return;
          }

          openAccountModal();
        };

        return <button onClick={onClick}>{text}</button>;
      }}
    </ConnectButton.Custom>
  );
}
