"use client";

import { ChakraProvider } from "@chakra-ui/react";
import theme from "@/style/theme";
import "@rainbow-me/rainbowkit/styles.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, WagmiProvider, createConfig } from "wagmi";
import {
  connectorsForWallets,
  RainbowKitProvider,
  darkTheme,
} from "@rainbow-me/rainbowkit";

import {
  metaMaskWallet,
  walletConnectWallet,
  rainbowWallet,
  safeWallet,
  coinbaseWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { supportedChains } from "@/utils/supportedChains";

const appName = "smart-wallet-walletconnect";
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!;

const connectors = connectorsForWallets(
  [
    {
      groupName: "Popular",
      wallets: [
        metaMaskWallet,
        coinbaseWallet,
        // Use WalletConnect with a custom storage prefix
        // This is to prevent clashes with our walletkit in wallet/bridge.
        ({ projectId }) =>
          walletConnectWallet({
            projectId,
            options: {
              customStoragePrefix: "rainbowkit-client-role-",
            },
          }),
        rainbowWallet,
        safeWallet,
      ],
    },
  ],
  { appName, projectId }
);

export const config = createConfig({
  connectors: [...connectors],
  chains: supportedChains,
  transports: supportedChains.reduce<Record<number, ReturnType<typeof http>>>(
    (transport, chain) => {
      transport[chain.id] = http();
      return transport;
    },
    {}
  ),
});

const queryClient = new QueryClient();

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <ChakraProvider theme={theme}>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider theme={darkTheme()} modalSize={"compact"}>
            {children}
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ChakraProvider>
  );
};
