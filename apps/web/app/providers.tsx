
"use client";

import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import type { ReactNode } from "react";
import { MOVEFORGE_NETWORK } from "./aptosConfig";

export default function Providers({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AptosWalletAdapterProvider
      autoConnect={true}
      dappConfig={{
        network: MOVEFORGE_NETWORK,
      }}
      onError={(error) => {
        console.error("Aptos wallet error:", error);
      }}
    >
      {children}
    </AptosWalletAdapterProvider>
  );
}
