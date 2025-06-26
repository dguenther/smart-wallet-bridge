export const apiBasePath =
  process.env.NEXT_PUBLIC_DEVELOPMENT === "true"
    ? ""
    : "https://dguenther.github.io/smart-wallet-bridge";

export const fetchContractAbiRaw = async ({
    address,
    chainId,
  }: {
    address: string;
    chainId: number;
  }): Promise<{
    abi: InterfaceAbi;
    name: string;
    implementation?: {
      address: string;
      abi: InterfaceAbi;
      name: string;
    };
  }> => {
    const res = await fetch(
      `${apiBasePath}/api/source-code?address=${address}&chainId=${chainId}`
    );
  
    const data: ContractResponse = await res.json();
    const { ABI, ContractName, Implementation } = data.result[0];
  
    if (Implementation.length > 0) {
      const res = await fetch(
        `${apiBasePath}/api/source-code?address=${Implementation}&chainId=${chainId}`
      );
  
      const implData: ContractResponse = await res.json();
      const { ABI: implAbi, ContractName: implName } = implData.result[0];
  
      return {
        abi: JSON.parse(ABI),
        name: ContractName,
        implementation: {
          address: Implementation,
          abi: JSON.parse(implAbi),
          name: implName,
        },
      };
    } else {
      return { abi: JSON.parse(ABI), name: ContractName };
    }
  };
  
  export const fetchContractAbi = async ({
    address,
    chainId,
  }: {
    address: string;
    chainId: number;
  }): Promise<{
    abi: InterfaceAbi;
    name: string;
  }> => {
    const { abi, name, implementation } = await fetchContractAbiRaw({
      address,
      chainId,
    });
  
    if (implementation) {
      return { abi: implementation.abi, name: implementation.name };
    } else {
      return { abi, name };
    }
  };

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