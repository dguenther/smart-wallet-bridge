import { hexToString, isHex } from "viem";

// Helper function to decode personal_sign and eth_sign messages
export const decodeSignMessage = (hexMessage: string) => {
    try {
      // Try to decode as UTF-8 string
      if (isHex(hexMessage)) {
        // First try to decode as UTF-8
        try {
          // viem doesn't have hexToUtf8, but hexToString should work for UTF-8
          return {
            decoded: hexToString(hexMessage),
            type: "utf8",
          };
        } catch {
          // If that fails, return the original hex
          return {
            decoded: hexMessage,
            type: "hex",
          };
        }
      }
  
      // If it's not hex, it might already be a string
      return {
        decoded: hexMessage,
        type: "string",
      };
    } catch (error) {
      console.error("Error decoding message:", error);
      return {
        decoded: hexMessage,
        type: "unknown",
      };
    }
  };