"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Container,
  Flex,
  Heading,
  Text,
  VStack,
  useToast,
  useDisclosure,
  Skeleton,
  SkeletonText,
  Stack,
  Button,
  FormControl,
  FormLabel,
  FormHelperText,
  useColorModeValue,
  IconButton,
  HStack,
  Collapse,
  Input,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  InputGroup,
  InputRightElement,
} from "@chakra-ui/react";
import {
  useAccount,
  useWalletClient,
  useChainId,
  useSwitchChain,
  useConnect,
  useBalance,
  useDisconnect,
} from "wagmi";
import { mnemonicToAccount } from "viem/accounts";
import { bytesToHex, pad } from "viem";
import { buildApprovedNamespaces } from "@walletconnect/utils";
import { headlessCSWConnector } from "@/utils/headlessCSWConnector";
import { CopyIcon } from "@chakra-ui/icons";
import { ViewIcon, ViewOffIcon } from "@chakra-ui/icons";

// Import types
import { SessionProposal, SessionRequest, WalletKitInstance } from "./types";

// Import components
import SessionProposalModal from "./components/SessionProposalModal";
import SessionRequestModal from "./components/SessionRequestModal";
import ConnectDapp from "./components/ConnectDapp";
import ActiveSessions from "./components/ActiveSessions";
import WalletKitInitializer from "./components/WalletKitInitializer";
import WalletKitEventHandler from "./components/WalletKitEventHandler";
import ChainNotifier from "./components/ChainNotifier";
import AutoPasteHandler from "./components/AutoPasteHandler";
import { filterActiveSessions } from "@/utils/filterActiveSessions";
import { chainIdToChain, supportedChains } from "@/utils/supportedChains";

export default function WalletBridgePage() {
  const toast = useToast();
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({
    address: address,
    query: {
      refetchOnMount: true,
      refetchInterval: 10000,
    },
  });

  // Add balance query for recovery owner
  const [recoveryOwnerAddress, setRecoveryOwnerAddress] = useState<string>("");
  const { data: recoveryOwnerBalance } = useBalance({
    address: recoveryOwnerAddress as `0x${string}`,
    query: {
      refetchOnMount: true,
      refetchInterval: 10000,
      enabled: !!recoveryOwnerAddress,
    },
  });

  // State for WalletConnect
  const [uri, setUri] = useState<string>("");
  const [pasted, setPasted] = useState(false);
  const [walletKit, setWalletKit] = useState<WalletKitInstance | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);

  // Modal states for different request types
  const {
    isOpen: isSessionProposalOpen,
    onOpen: onSessionProposalOpen,
    onClose: onSessionProposalClose,
  } = useDisclosure();

  const {
    isOpen: isSessionRequestOpen,
    onOpen: onSessionRequestOpen,
    onClose: onSessionRequestClose,
  } = useDisclosure();

  // Current request states
  const [currentSessionProposal, setCurrentSessionProposal] =
    useState<SessionProposal | null>(null);
  const [currentSessionRequest, setCurrentSessionRequest] =
    useState<SessionRequest | null>(null);
  const [decodedTxData, setDecodedTxData] = useState<any>(null);
  const [isDecodingTx, setIsDecodingTx] = useState<boolean>(false);
  const [decodedSignatureData, setDecodedSignatureData] = useState<{
    type: "message" | "typedData";
    decoded: any;
  } | null>(null);

  // Add a new state to track if we're switching chains
  const [isSwitchingChain, setIsSwitchingChain] = useState<boolean>(false);
  const [pendingRequest, setPendingRequest] = useState<boolean>(false);

  // Add a state to track if we need to switch chains
  const [needsChainSwitch, setNeedsChainSwitch] = useState<boolean>(false);
  const [targetChainId, setTargetChainId] = useState<number | null>(null);

  // State for HeadlessCSW form
  const [recoveryPhrase, setRecoveryPhrase] = useState<string>("");
  const [isConnecting, setIsConnecting] = useState<boolean>(false);

  // Advanced options state
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [manualAddress, setManualAddress] = useState<string>("");
  const [manualOwnerIndex, setManualOwnerIndex] = useState<number>(2);

  // State for recovery phrase visibility
  const [showRecoveryPhrase, setShowRecoveryPhrase] = useState<boolean>(false);

  // HeadlessCSW Form Component
  const HeadlessCSWForm = () => {
    const formBg = useColorModeValue("gray.50", "gray.700");
    const borderColor = useColorModeValue("gray.200", "gray.600");

    const handleConnect = async () => {
      if (!recoveryPhrase) {
        toast({
          title: "Missing Information",
          description: "Please provide your recovery phrase",
          status: "error",
          duration: 3000,
          isClosable: true,
          position: "bottom-right",
        });
        return;
      }

      try {
        setIsConnecting(true);

        // Validate and derive private key from recovery phrase
        const words = recoveryPhrase.trim().split(" ");

        if (words[0]?.toLowerCase() !== "wallet") {
          throw new Error(
            `Invalid recovery phrase. The first word should be 'wallet'. Got: ${words[0]}`
          );
        }

        // Remove the first word "wallet"
        const mnemonic = words.slice(1).join(" ");

        if (mnemonic.split(" ").length !== 12) {
          throw new Error(
            "Invalid recovery phrase. Expected 12 words (excluding 'wallet')."
          );
        }

        const recoveryOwnerAccount = mnemonicToAccount(mnemonic);
        const privateKeyBytes = recoveryOwnerAccount.getHdKey().privateKey;
        const ownerPrivateKey = bytesToHex(privateKeyBytes!);

        // Store the recovery owner address for display
        const recoveryOwnerAddr = recoveryOwnerAccount.address;
        setRecoveryOwnerAddress(recoveryOwnerAddr);

        let smartWalletAddress = manualAddress;
        let finalOwnerIndex = manualOwnerIndex;

        // If manual values are not provided, try automatic discovery
        if (!manualAddress) {
          // Derive public key for API query
          const publicKeyBytes = recoveryOwnerAccount.getHdKey().publicKey;
          const publicKey = bytesToHex(publicKeyBytes!);

          console.log("publicKey", publicKey);

          toast({
            title: "Looking up smart wallet",
            description: "Finding your smart wallet address...",
            status: "info",
            duration: 2000,
            isClosable: true,
            position: "bottom-right",
          });

          // Query the addOwner API by owner public key
          // Note: This assumes an endpoint that queries by owner - may need API endpoint adjustment
          const paddedOwnerAddress = pad(recoveryOwnerAddr, {
            size: 32,
          });
          const apiUrl = `https://addowner-indexer-production.up.railway.app/events/${paddedOwnerAddress}`;

          let response;
          let addOwnerEvents;

          try {
            response = await fetch(apiUrl);

            if (!response.ok) {
              // If by-owner endpoint doesn't exist, we'll need to handle this differently
              throw new Error(
                `API request failed: ${response.status} ${response.statusText}`
              );
            }

            addOwnerEvents = await response.json();
          } catch {
            // Fallback: inform user that we need the address
            throw new Error(
              "Could not automatically find your smart wallet address. Please use the advanced options to manually enter your wallet address."
            );
          }

          if (!addOwnerEvents || addOwnerEvents.length === 0) {
            throw new Error(
              "No smart wallet found for this recovery phrase. Please verify your recovery phrase is correct or use the advanced options."
            );
          }

          // Use the first matching event's address and index
          const matchingEvent = addOwnerEvents[0];
          smartWalletAddress = matchingEvent.address;
          finalOwnerIndex = matchingEvent.index;

          toast({
            title: "Smart wallet found",
            description: `Found wallet ${smartWalletAddress.slice(
              0,
              6
            )}...${smartWalletAddress.slice(
              -4
            )} at owner index ${finalOwnerIndex}`,
            status: "success",
            duration: 4000,
            isClosable: true,
            position: "bottom-right",
          });
        } else {
          toast({
            title: "Using manual configuration",
            description: `Connecting to ${smartWalletAddress.slice(
              0,
              6
            )}...${smartWalletAddress.slice(
              -4
            )} with owner index ${finalOwnerIndex}`,
            status: "info",
            duration: 3000,
            isClosable: true,
            position: "bottom-right",
          });
        }

        connect({
          connector: headlessCSWConnector({
            address: smartWalletAddress as `0x${string}`,
            ownerIndex: finalOwnerIndex,
            ownerPrivateKey: ownerPrivateKey as `0x${string}`,
          }),
        });
      } catch (error) {
        console.error("Connection error:", error);
        toast({
          title: "Connection Failed",
          description: (error as Error).message,
          status: "error",
          duration: 5000,
          isClosable: true,
          position: "bottom-right",
        });
      } finally {
        setIsConnecting(false);
      }
    };

    return (
      <Box
        p={4}
        borderWidth={1}
        borderRadius="lg"
        bg={formBg}
        borderColor={borderColor}
      >
        <VStack spacing={4} align="stretch">
          <Heading size="md">Connect Headless Smart Wallet</Heading>

          <FormControl isRequired>
            <FormLabel>Recovery Phrase</FormLabel>
            <InputGroup>
              <Input
                type={showRecoveryPhrase ? "text" : "password"}
                placeholder="wallet word1 word2 word3 ... word12"
                value={recoveryPhrase}
                onChange={(e) => setRecoveryPhrase(e.target.value)}
              />
              <InputRightElement>
                <IconButton
                  aria-label="Toggle recovery phrase visibility"
                  icon={showRecoveryPhrase ? <ViewOffIcon /> : <ViewIcon />}
                  size="xs"
                  variant="ghost"
                  onClick={() => setShowRecoveryPhrase(!showRecoveryPhrase)}
                />
              </InputRightElement>
            </InputGroup>
            <FormHelperText>
              Recovery phrase starting with &apos;wallet&apos; followed by 12
              words. We&apos;ll automatically find your smart wallet address.
            </FormHelperText>
          </FormControl>

          <Box>
            <Button
              variant="link"
              size="sm"
              onClick={() => setShowAdvanced(!showAdvanced)}
              mb={2}
            >
              {showAdvanced ? "Hide" : "Show"} Advanced Options
            </Button>

            <Collapse in={showAdvanced} animateOpacity>
              <VStack
                spacing={3}
                align="stretch"
                p={3}
                borderWidth={1}
                borderRadius="md"
                bg={useColorModeValue("gray.100", "gray.600")}
              >
                <Text fontSize="sm" fontWeight="medium">
                  Manual Configuration (optional)
                </Text>

                <FormControl>
                  <FormLabel fontSize="sm">Smart Wallet Address</FormLabel>
                  <Input
                    placeholder="0x..."
                    value={manualAddress}
                    onChange={(e) => setManualAddress(e.target.value)}
                    size="sm"
                  />
                  <FormHelperText fontSize="xs">
                    Manually specify your smart wallet address
                  </FormHelperText>
                </FormControl>

                <FormControl>
                  <FormLabel fontSize="sm">Owner Index</FormLabel>
                  <NumberInput
                    value={manualOwnerIndex}
                    onChange={(_, value) => setManualOwnerIndex(value || 2)}
                    min={0}
                    size="sm"
                  >
                    <NumberInputField />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                  <FormHelperText fontSize="xs">
                    Owner index for this recovery phrase (default: 2)
                  </FormHelperText>
                </FormControl>
              </VStack>
            </Collapse>
          </Box>

          <Button
            colorScheme="blue"
            onClick={handleConnect}
            isLoading={isConnecting}
            loadingText="Finding wallet..."
          >
            Connect Wallet
          </Button>
        </VStack>
      </Box>
    );
  };

  // Handle session request (like eth_sendTransaction)
  const handleSessionRequest = useCallback(
    async (approve: boolean) => {
      if (!walletKit || !currentSessionRequest || !walletClient) return;

      try {
        const { id, topic, params } = currentSessionRequest;
        const { request } = params;

        if (approve) {
          console.log("approving request", request);
          let result;

          setPendingRequest(true);

          // Handle different request methods
          if (request.method === "eth_sendTransaction") {
            const txParams = request.params[0];

            // Send transaction using wagmi wallet client
            const hash = await walletClient.sendTransaction({
              account: address as `0x${string}`,
              to: txParams.to as `0x${string}`,
              value: txParams.value ? BigInt(txParams.value) : undefined,
              data: txParams.data as `0x${string}` | undefined,
              gas: txParams.gas ? BigInt(txParams.gas) : undefined,
            });

            result = hash;
          } else if (
            request.method === "personal_sign" ||
            request.method === "eth_sign"
          ) {
            const message = request.params[0];
            const signature = await walletClient.signMessage({
              account: address as `0x${string}`,
              message: { raw: message as `0x${string}` },
            });

            result = signature;
          } else if (
            request.method === "eth_signTypedData" ||
            request.method === "eth_signTypedData_v3" ||
            request.method === "eth_signTypedData_v4"
          ) {
            let typedData = request.params[1];
            try {
              typedData = JSON.parse(request.params[1]);
            } catch (e) {
              console.error("Error parsing typed data:", e);
            }

            const signature = await walletClient.signTypedData({
              account: address as `0x${string}`,
              domain: typedData.domain,
              types: typedData.types,
              primaryType: typedData.primaryType,
              message: typedData.message,
            });

            result = signature;
          } else if (request.method === "wallet_switchEthereumChain") {
            // Handle chain switching request
            const requestedChainId = parseInt(request.params[0].chainId);

            // Switch chain using wagmi
            setIsSwitchingChain(true);
            await switchChainAsync({ chainId: requestedChainId });
            setIsSwitchingChain(false);

            // Return success
            result = null;
          } else if (request.method === "wallet_addEthereumChain") {
            // For adding a new chain, we'll just show a toast for now
            // In a real implementation, you might want to add the chain to your wallet
            const chainParams = request.params[0];

            toast({
              title: "Add Chain Request",
              description: `Request to add chain ${chainParams.chainName} (${chainParams.chainId})`,
              status: "info",
              duration: 5000,
              isClosable: true,
              position: "bottom-right",
            });

            // Return success
            result = null;
          } else {
            // For other methods, just return success
            result = "0x";
          }

          // Respond to the request
          await walletKit.respondSessionRequest({
            topic,
            response: {
              id,
              jsonrpc: "2.0",
              result,
            },
          });

          setPendingRequest(false);
          setNeedsChainSwitch(false);
          setTargetChainId(null);

          toast({
            title: "Request approved",
            description: `Method: ${request.method}`,
            status: "success",
            duration: 3000,
            isClosable: true,
            position: "bottom-right",
          });
        } else {
          // Reject the request
          await walletKit.respondSessionRequest({
            topic,
            response: {
              id,
              jsonrpc: "2.0",
              error: {
                code: 4001,
                message: "User rejected the request",
              },
            },
          });

          toast({
            title: "Request rejected",
            status: "info",
            duration: 3000,
            isClosable: true,
            position: "bottom-right",
          });
        }

        // Close the modal
        onSessionRequestClose();
      } catch (error) {
        console.error("Error handling session request:", error);
        setPendingRequest(false);
        setIsSwitchingChain(false);
        setNeedsChainSwitch(false);
        setTargetChainId(null);

        // Extract a more user-friendly error message using Viem's error handling
        let errorMessage = String(error);

        // Check if it's a Viem error with a walk method
        if (
          error &&
          typeof error === "object" &&
          "walk" in error &&
          typeof error.walk === "function"
        ) {
          try {
            // Try to extract ContractFunctionRevertedError or other specific error types
            const specificError = error.walk(
              (err: any) =>
                err?.name === "ContractFunctionRevertedError" ||
                err?.shortMessage ||
                err?.message
            );

            if (specificError) {
              // Use the most specific error information available
              errorMessage =
                specificError.shortMessage ||
                specificError.message ||
                specificError.data?.message ||
                specificError.data?.errorName ||
                String(specificError);

              // Clean up the error message
              errorMessage = errorMessage
                .replace(/^(Error:|ContractFunctionRevertedError:)/, "")
                .trim();
            }
          } catch (walkError) {
            console.error("Error extracting specific error:", walkError);
          }
        }

        toast({
          title: "Error",
          description: `Failed to ${
            approve ? "approve" : "reject"
          } request: ${errorMessage}`,
          status: "error",
          duration: 5000,
          isClosable: true,
          position: "bottom-right",
        });

        // Note: We're not automatically closing the modal on error
        // This allows users to see the error and manually close the modal if needed
      }
    },
    [
      walletKit,
      currentSessionRequest,
      walletClient,
      address,
      toast,
      switchChainAsync,
      onSessionRequestClose,
    ]
  );

  // Custom close handler for session request modal
  const handleSessionRequestClose = useCallback(() => {
    // If there's an active request, reject it when closing the modal
    if (
      currentSessionRequest &&
      walletKit &&
      !pendingRequest &&
      !isSwitchingChain
    ) {
      handleSessionRequest(false);
    } else {
      // Just close the modal without rejecting if we're in the middle of processing
      onSessionRequestClose();
      setCurrentSessionRequest(null);

      // Show a warning toast if closing during processing
      if (pendingRequest || isSwitchingChain) {
        handleSessionRequest(false);
        toast({
          title: "Request in progress",
          description:
            "The request might still be processing in the background. You can check the status in your wallet.",
          status: "warning",
          duration: 5000,
          isClosable: true,
          position: "bottom-right",
        });

        // Reset states after a delay to ensure UI is responsive
        setTimeout(() => {
          setPendingRequest(false);
          setIsSwitchingChain(false);
          setNeedsChainSwitch(false);
          setTargetChainId(null);
        }, 500);
      }
    }
  }, [
    currentSessionRequest,
    walletKit,
    pendingRequest,
    isSwitchingChain,
    handleSessionRequest,
    onSessionRequestClose,
    toast,
  ]);

  // Connect to dapp using WalletConnect URI
  const connectToDapp = useCallback(async () => {
    if (!walletKit || !uri) return;

    try {
      await walletKit.core.pairing.pair({ uri });
      setUri("");
      toast({
        title: "Connecting to dapp",
        description: "Waiting for session proposal...",
        status: "info",
        duration: 3000,
        isClosable: true,
        position: "bottom-right",
      });
    } catch (error) {
      console.error("Failed to connect to dapp:", error);
      toast({
        title: "Failed to connect to dapp",
        description: (error as Error).message,
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom-right",
      });
    }
  }, [walletKit, uri, toast]);

  // Approve session proposal
  const approveSessionProposal = useCallback(async () => {
    if (!walletKit || !currentSessionProposal || !address) return;

    try {
      const chains = supportedChains.map((chain) => `eip155:${chain.id}`);
      const accounts = chains.map((chain) => `${chain}:${address}`);

      const namespaces = buildApprovedNamespaces({
        proposal: currentSessionProposal.params,
        supportedNamespaces: {
          eip155: {
            chains,
            accounts,
            methods: [
              "eth_sendTransaction",
              "eth_sign",
              "personal_sign",
              "eth_signTransaction",
              "eth_signTypedData",
              "eth_signTypedData_v3",
              "eth_signTypedData_v4",
              "wallet_switchEthereumChain",
              "wallet_addEthereumChain",
            ],
            events: ["chainChanged", "accountsChanged"],
          },
        },
      });

      console.log("Approving session with namespaces:", namespaces);

      await walletKit.approveSession({
        id: currentSessionProposal.id,
        namespaces,
      });

      // Update active sessions
      const sessions = walletKit.getActiveSessions();
      setActiveSessions(filterActiveSessions(Object.values(sessions)));

      onSessionProposalClose();
      setCurrentSessionProposal(null);

      toast({
        title: "Session approved",
        status: "success",
        duration: 3000,
        isClosable: true,
        position: "bottom-right",
      });
    } catch (error) {
      console.error("Failed to approve session:", error);
      toast({
        title: "Failed to approve session",
        description: (error as Error).message,
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom-right",
      });
    }
  }, [
    walletKit,
    currentSessionProposal,
    address,
    onSessionProposalClose,
    toast,
  ]);

  // Reject session proposal
  const rejectSessionProposal = useCallback(async () => {
    if (!walletKit || !currentSessionProposal) return;

    try {
      await walletKit.rejectSession({
        id: currentSessionProposal.id,
        reason: {
          code: 4001,
          message: "User rejected the session",
        },
      });

      onSessionProposalClose();
      setCurrentSessionProposal(null);

      toast({
        title: "Session rejected",
        status: "info",
        duration: 3000,
        isClosable: true,
        position: "bottom-right",
      });
    } catch (error) {
      console.error("Failed to reject session:", error);
      toast({
        title: "Failed to reject session",
        description: (error as Error).message,
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom-right",
      });
    }
  }, [walletKit, currentSessionProposal, onSessionProposalClose, toast]);

  // Handle chain switch
  const handleChainSwitch = useCallback(async () => {
    if (!targetChainId) return;

    try {
      setIsSwitchingChain(true);
      await switchChainAsync({ chainId: targetChainId });
      setIsSwitchingChain(false);
      setNeedsChainSwitch(false);

      // No need to set targetChainId to null here as we want to keep it
      // for reference in case the user needs to switch back
    } catch (error) {
      setIsSwitchingChain(false);
      console.error("Error switching chain:", error);
      toast({
        title: "Chain Switch Failed",
        description: `Failed to switch to ${
          chainIdToChain(targetChainId)?.name || `Chain ID: ${targetChainId}`
        }`,
        status: "error",
        duration: 3000,
        isClosable: true,
        position: "bottom-right",
      });
    }
  }, [targetChainId, switchChainAsync, toast]);

  // Disconnect session
  const disconnectSession = useCallback(
    async (topic: string) => {
      if (!walletKit) return;

      try {
        await walletKit.disconnectSession({
          topic,
          reason: {
            code: 6000,
            message: "User disconnected the session",
          },
        });

        // Update active sessions
        const sessions = walletKit.getActiveSessions();
        setActiveSessions(filterActiveSessions(Object.values(sessions)));

        toast({
          title: "Session disconnected",
          status: "info",
          duration: 3000,
          isClosable: true,
          position: "bottom-right",
        });
      } catch (error) {
        console.error("Failed to disconnect session:", error);
        toast({
          title: "Failed to disconnect session",
          description: (error as Error).message,
          status: "error",
          duration: 5000,
          isClosable: true,
          position: "bottom-right",
        });
      }
    },
    [walletKit, toast]
  );

  // Check if chain switch is needed when session request changes
  useEffect(() => {
    if (currentSessionRequest && chainId) {
      const { params } = currentSessionRequest;
      const { request } = params;

      // Extract the requested chain ID from the request
      const requestedChainIdStr = params.chainId.split(":")[1];
      const requestedChainId = parseInt(requestedChainIdStr);

      // Check if we need to switch chains for this request
      const requiresChainSwitch =
        chainId !== requestedChainId &&
        (request.method === "eth_sendTransaction" ||
          request.method === "eth_signTransaction" ||
          request.method === "eth_sign" ||
          request.method === "personal_sign" ||
          request.method === "eth_signTypedData" ||
          request.method === "eth_signTypedData_v3" ||
          request.method === "eth_signTypedData_v4");

      setNeedsChainSwitch(requiresChainSwitch);
      setTargetChainId(requiresChainSwitch ? requestedChainId : null);
    } else {
      setNeedsChainSwitch(false);
      setTargetChainId(null);
    }
  }, [currentSessionRequest, chainId]);

  // Add copy function
  const copyAddress = useCallback(async () => {
    if (!address) return;

    try {
      await navigator.clipboard.writeText(address);
      toast({
        title: "Address copied",
        description: "Wallet address copied to clipboard",
        status: "success",
        duration: 2000,
        isClosable: true,
        position: "bottom-right",
      });
    } catch (error) {
      console.error("Failed to copy address:", error);
      toast({
        title: "Copy failed",
        description: "Failed to copy address to clipboard",
        status: "error",
        duration: 3000,
        isClosable: true,
        position: "bottom-right",
      });
    }
  }, [address, toast]);

  // Add copy function for recovery owner address
  const copyRecoveryOwnerAddress = useCallback(async () => {
    if (!recoveryOwnerAddress) return;

    try {
      await navigator.clipboard.writeText(recoveryOwnerAddress);
      toast({
        title: "Recovery address copied",
        description: "Recovery owner address copied to clipboard",
        status: "success",
        duration: 2000,
        isClosable: true,
        position: "bottom-right",
      });
    } catch (error) {
      console.error("Failed to copy recovery address:", error);
      toast({
        title: "Copy failed",
        description: "Failed to copy recovery address to clipboard",
        status: "error",
        duration: 3000,
        isClosable: true,
        position: "bottom-right",
      });
    }
  }, [recoveryOwnerAddress, toast]);

  // Handle disconnect
  const handleDisconnect = useCallback(() => {
    disconnect();
    setRecoveryOwnerAddress("");
    toast({
      title: "Wallet disconnected",
      description: "Successfully disconnected from wallet",
      status: "info",
      duration: 3000,
      isClosable: true,
      position: "bottom-right",
    });
  }, [disconnect, toast]);

  return (
    <Container
      mt="0.25rem"
      maxW={"80%"}
      px={{ base: 3, sm: 4, md: 6 }}
      mx="auto"
    >
      {/* Initialize WalletKit */}
      <WalletKitInitializer
        isConnected={isConnected}
        address={address}
        setWalletKit={setWalletKit}
        setActiveSessions={setActiveSessions}
        setIsInitializing={setIsInitializing}
        isInitializing={isInitializing}
      />

      {/* Handle WalletKit events */}
      <WalletKitEventHandler
        walletKit={walletKit}
        address={address}
        setCurrentSessionProposal={setCurrentSessionProposal}
        setCurrentSessionRequest={setCurrentSessionRequest}
        setDecodedTxData={setDecodedTxData}
        setIsDecodingTx={setIsDecodingTx}
        setDecodedSignatureData={setDecodedSignatureData}
        setActiveSessions={setActiveSessions}
        onSessionProposalOpen={onSessionProposalOpen}
        onSessionRequestOpen={onSessionRequestOpen}
      />

      {/* Notify dApps about chain changes */}
      <ChainNotifier
        walletKit={walletKit}
        isConnected={isConnected}
        chainId={chainId}
        activeSessions={activeSessions}
      />

      {/* Handle auto-paste of WalletConnect URIs */}
      <AutoPasteHandler
        pasted={pasted}
        isConnected={isConnected}
        uri={uri}
        connectToDapp={connectToDapp}
        setPasted={setPasted}
      />

      <VStack
        spacing={{ base: 4, md: 6 }}
        align="stretch"
        w="100%"
        maxW={{ base: "100%", md: "700px", lg: "800px" }}
        mx="auto"
      >
        <Flex
          justifyContent="space-between"
          alignItems="center"
          direction={{ base: "column", lg: "row" }}
          gap={{ base: 4, lg: 0 }}
        >
          <Heading size={{ base: "xl", md: "xl" }}>Smart Wallet Bridge</Heading>
          {isConnected && (
            <Box textAlign="right">
              <HStack spacing={2} justify="flex-end" mb={2}>
                <Text fontSize="sm" color="green.500" fontWeight="semibold">
                  ✅ Wallet Connected
                </Text>
                <Button
                  size="xs"
                  variant="outline"
                  colorScheme="red"
                  onClick={handleDisconnect}
                >
                  Disconnect
                </Button>
              </HStack>

              {/* Smart Wallet Address */}
              <Box mb={2}>
                <Text fontSize="xs" color="gray.500" fontWeight="medium" mb={1}>
                  Smart Wallet:
                </Text>
                <HStack spacing={2} justify="flex-end" mb={1}>
                  <Text
                    fontSize="xs"
                    color="gray.500"
                    noOfLines={1}
                    maxW="200px"
                  >
                    {address}
                  </Text>
                  <IconButton
                    aria-label="Copy smart wallet address"
                    icon={<CopyIcon />}
                    size="xs"
                    variant="ghost"
                    onClick={copyAddress}
                    colorScheme="gray"
                  />
                </HStack>
                <Text fontSize="xs" color="gray.600" fontWeight="medium">
                  Balance:{" "}
                  {balance
                    ? `${parseFloat(balance.formatted).toFixed(4)} ${
                        balance.symbol
                      }`
                    : "Loading..."}
                </Text>
              </Box>

              {/* Recovery Owner Address */}
              {recoveryOwnerAddress && (
                <Box>
                  <Text
                    fontSize="xs"
                    color="gray.500"
                    fontWeight="medium"
                    mb={1}
                  >
                    Recovery Owner:
                  </Text>
                  <HStack spacing={2} justify="flex-end" mb={1}>
                    <Text
                      fontSize="xs"
                      color="gray.500"
                      noOfLines={1}
                      maxW="200px"
                    >
                      {recoveryOwnerAddress}
                    </Text>
                    <IconButton
                      aria-label="Copy recovery owner address"
                      icon={<CopyIcon />}
                      size="xs"
                      variant="ghost"
                      onClick={copyRecoveryOwnerAddress}
                      colorScheme="gray"
                    />
                  </HStack>
                  <Text fontSize="xs" color="gray.600" fontWeight="medium">
                    Balance:{" "}
                    {recoveryOwnerBalance
                      ? `${parseFloat(recoveryOwnerBalance.formatted).toFixed(
                          4
                        )} ${recoveryOwnerBalance.symbol}`
                      : "Loading..."}
                  </Text>
                </Box>
              )}
            </Box>
          )}
        </Flex>

        <Box>
          {isInitializing ? (
            <Box p={{ base: 4, md: 6 }} borderWidth={1} borderRadius="lg">
              <Stack spacing={4}>
                <Skeleton height="40px" width="60%" />
                <SkeletonText
                  mt={2}
                  noOfLines={3}
                  spacing={4}
                  skeletonHeight={4}
                />
                <Skeleton height="60px" mt={2} />
              </Stack>
            </Box>
          ) : (
            <>
              {!isConnected && (
                <Box
                  mt={{ base: 0, md: -5 }}
                  p={{ base: 4, md: 6 }}
                  borderWidth={1}
                  borderRadius="lg"
                  textAlign="center"
                  mb={{ base: 3, md: 4 }}
                >
                  <Text mb={{ base: 3, md: 4 }}>
                    Enter your recovery phrase to automatically connect to your
                    smart wallet. If automatic discovery doesn&apos;t work, use
                    the advanced options to manually specify your wallet
                    details. You can generate a recovery phrase{" "}
                    <a
                      href="https://keys.coinbase.com/settings/account-recovery"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ textDecoration: "underline" }}
                    >
                      here
                    </a>
                    .
                  </Text>
                  <HeadlessCSWForm />
                </Box>
              )}

              {/* Connect to dapp section */}
              <ConnectDapp
                uri={uri}
                setUri={setUri}
                setPasted={setPasted}
                isConnected={isConnected}
                connectToDapp={connectToDapp}
              />

              {/* Active Sessions section */}
              <ActiveSessions
                isConnected={isConnected}
                activeSessions={activeSessions}
                chainId={chainId}
                disconnectSession={disconnectSession}
              />
            </>
          )}
        </Box>
      </VStack>

      {/* Session Proposal Modal */}
      <SessionProposalModal
        isOpen={isSessionProposalOpen}
        onClose={onSessionProposalClose}
        currentSessionProposal={currentSessionProposal}
        onApprove={approveSessionProposal}
        onReject={rejectSessionProposal}
      />

      {/* Session Request Modal */}
      <SessionRequestModal
        isOpen={isSessionRequestOpen}
        onClose={handleSessionRequestClose}
        currentSessionRequest={currentSessionRequest}
        decodedTxData={decodedTxData}
        isDecodingTx={isDecodingTx}
        decodedSignatureData={decodedSignatureData}
        pendingRequest={pendingRequest}
        isSwitchingChain={isSwitchingChain}
        needsChainSwitch={needsChainSwitch}
        targetChainId={targetChainId}
        onApprove={() => handleSessionRequest(true)}
        onReject={() => handleSessionRequest(false)}
        onChainSwitch={handleChainSwitch}
      />
    </Container>
  );
}
