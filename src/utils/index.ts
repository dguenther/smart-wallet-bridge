  export const generateTenderlyUrl = (
    txData: {
      from: string;
      to: string;
      value: string;
      data: string;
    },
    chainId: number
  ) => {
    const baseUrl = "https://dashboard.tenderly.co/simulator/new";
    const encodedParams = [
      `from=${encodeURIComponent(txData.from)}`,
      `contractAddress=${encodeURIComponent(txData.to)}`,
      `value=${encodeURIComponent(txData.value)}`,
      `rawFunctionInput=${encodeURIComponent(txData.data)}`,
      `network=${encodeURIComponent(chainId)}`,
    ].join("&");
  
    return `${baseUrl}?${encodedParams}`;
  };