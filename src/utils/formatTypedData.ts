// Helper function to format EIP-712 typed data in a human-readable way
export const formatTypedData = (typedData: any) => {
    if (!typedData) return null;
  
    try {
      // If typedData is a string, try to parse it
      const data =
        typeof typedData === "string" ? JSON.parse(typedData) : typedData;
  
      return {
        domain: data.domain,
        primaryType: data.primaryType,
        types: data.types,
        message: data.message,
      };
    } catch (error) {
      console.error("Error formatting typed data:", error);
      return null;
    }
  };