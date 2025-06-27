"use client";

import { ChakraProvider } from "@chakra-ui/react";
import theme from "@/style/theme";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, WagmiProvider, createConfig } from "wagmi";
import { supportedChains } from "@/utils/supportedChains";


export const config = createConfig({
  connectors: [],
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
            {children}
        </QueryClientProvider>
      </WagmiProvider>
    </ChakraProvider>
  );
};
