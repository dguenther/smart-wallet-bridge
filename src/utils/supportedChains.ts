import { base } from "viem/chains";

export const supportedChains = [base] as const;

export const chainIdToChain = (id: number) => supportedChains.find(c => c.id === id)
