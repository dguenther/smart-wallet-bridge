import {
  Account,
  Address,
  Chain,
  decodeFunctionData,
  Hex,
  hexToNumber,
  PublicClient,
  Transport,
  WalletClient,
} from "viem";
import { entryPoint06Abi, entryPoint06Address } from "viem/account-abstraction";
import { smartWalletAbi } from "./smartWalletAbi";
import { smartWalletFactoryAbi } from "./smartWalletFactoryAbi";

export async function syncSmartAccountOwners({
  targetClient,
  targetWalletClient,
  address,
}: {
  targetClient: PublicClient;
  targetWalletClient: WalletClient<Transport, Chain, Account>;
  address: `0x${string}`;
}) {
  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/replayable-ops/${address}`;

  const response = await fetch(apiUrl);

  // TODO: Will probably need to deserialize UserOperation
  const data = (await response.json()) as {
    initCode: Hex;
    items: {
      transactionHash: Hex;
      owner: Hex;
      ownerIndex: number;
      userOperation: {
        sender: Address;
        nonce: Hex;
        initCode: Hex;
        callData: Hex;
        callGasLimit: Hex;
        maxFeePerGas: Hex;
        maxPriorityFeePerGas: Hex;
        verificationGasLimit: Hex;
        preVerificationGas: Hex;
        paymasterAndData: Hex;
        signature: Hex;
      };
    }[];
  };
  const replayableUserOps = data.items.map(
    ({ userOperation }) => userOperation
  );

  if (data.initCode === "0x") {
    throw new Error("No init code found");
  }

  const initData = decodeFunctionData({
    abi: smartWalletFactoryAbi,
    data: ("0x" + data.initCode.slice(42)) as `0x${string}`,
  });

  if (initData.functionName !== "createAccount") {
    throw new Error("Invalid init code");
  }

  const initialOwners = initData.args[0];

  let nextAddOwnerIndex = initialOwners.length;

  console.log(
    `Account will be initialized with ${initialOwners.length} owners and ${replayableUserOps.length} replayable user ops`
  );

  const isDeployed = await targetClient.getCode({
    address,
  });

  if (isDeployed) {
    console.log("Account already deployed");
    // Check how many owners and if indexes consistent with AddOwner events
    const ownerCount = await targetClient.readContract({
      abi: smartWalletAbi,
      functionName: "ownerCount",
      address,
    });

    console.log(
      `Found ${ownerCount} owners on target chain. Checking for consistency`
    );

    if (Number(ownerCount) !== initialOwners.length) {
      // We have more owners than initial owners, so we need to check
      // if the last owner is still consistent with the corresponding AddOwner event on Base
      const ownerAtLastIndex = await targetClient.readContract({
        abi: smartWalletAbi,
        functionName: "ownerAtIndex",
        address,
        args: [ownerCount - BigInt(1)],
      });

      console.log(
        `Looking for owner at index ${Number(ownerCount) - 1}`,
        ownerAtLastIndex
      );

      const correspondingOwner = data.items.find(
        (item) => item.ownerIndex === Number(ownerCount) - 1
      )?.owner;

      if (ownerAtLastIndex !== correspondingOwner) {
        throw new Error(
          `Owner at corresponding index does not match: Expected ${ownerAtLastIndex} but got ${correspondingOwner}`
        );
      }
    }

    nextAddOwnerIndex = Number(ownerCount);
  } else {
    console.log("Account not deployed, deploying...");

    // Deploy smart account
    const deployTx = await targetWalletClient.sendTransaction({
      to: data.initCode.slice(0, 42) as `0x${string}`,
      data: ("0x" + data.initCode.slice(42)) as `0x${string}`,
    });

    console.log("deployTx", deployTx);

    const receipt = await targetClient.waitForTransactionReceipt({
      hash: deployTx,
    });

    if (receipt.status !== "success") {
      throw new Error("Deployment failed");
    }
  }

  const indexInItems = nextAddOwnerIndex - initialOwners.length;

  console.log("Replaying from owner index", nextAddOwnerIndex);

  if (replayableUserOps.slice(indexInItems).length === 0) {
    return 0;
  }

  console.log("All addOwnerUserOps", replayableUserOps);

  const userOpsToReplay = replayableUserOps
    .slice(indexInItems)
    .map((userOp) => {
      return {
        ...userOp,
        initCode: userOp.initCode ?? "0x",
        paymasterAndData: userOp.paymasterAndData ?? "0x",
      };
    });

  userOpsToReplay.forEach((userOp) => {
    const nonce = BigInt(hexToNumber(userOp.nonce)) & BigInt(0xfffffffff);

    const functionData = decodeFunctionData({
      abi: smartWalletAbi,
      data: userOp.callData,
    });

    if (functionData.functionName === "executeWithoutChainIdValidation") {
      const executeData = decodeFunctionData({
        abi: smartWalletAbi,
        data: `${functionData.args[0]}` as `0x${string}`,
      });

      console.log("nonce", nonce);
      console.log("executeData", executeData);
    } else {
      console.log("functionData", functionData);
    }
  });

  // Replay all the userOps on target chain
  const handleOpsTx = await targetWalletClient.writeContract({
    abi: entryPoint06Abi,
    address: entryPoint06Address,
    functionName: "handleOps",
    // @ts-expect-error -- userOpsToReplay is not typed correctly but will be converted by viem
    args: [userOpsToReplay, address],
  });

  console.log("handleOpsTx", handleOpsTx);

  const receipt = await targetClient.waitForTransactionReceipt({
    hash: handleOpsTx,
  });

  if (receipt.status !== "success") {
    throw new Error("HandleOps failed");
  }

  const ownerCount = await targetClient.readContract({
    abi: smartWalletAbi,
    functionName: "ownerCount",
    address,
  });

  console.log("Owners synced", ownerCount, "\n");

  return ownerCount;
}
