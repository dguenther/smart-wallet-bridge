import { arbitrum, base, mainnet, optimism } from "viem/chains";

export const supportedChains = [mainnet, arbitrum, optimism, base] as const;

export const chainIdToChain = (id: number) =>
  supportedChains.find((c) => c.id === id);
