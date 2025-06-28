import {
  Account,
  Chain,
  decodeFunctionData,
  encodeFunctionData,
  formatEther,
  PublicClient,
  Transport,
  WalletClient,
} from "viem";
import {
  entryPoint06Abi,
  entryPoint06Address,
  UserOperation,
} from "viem/account-abstraction";
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
  const apiUrl = `https://addowner-indexer-production.up.railway.app/ops/${address}`;

  const response = await fetch(apiUrl);

  // TODO: Will probably need to deserialize UserOperation
  const data = (await response.json()) as {
    transactionHash: `0x${string}`;
    userOperation: UserOperation<"0.6">;
  }[];
  const addOwnerUserOps = data.map(({ userOperation }) => userOperation);

  if (!addOwnerUserOps[0]) {
    throw new Error("No AddOwner logs found");
  }

  const deployUserOp = addOwnerUserOps[0];
  if (!deployUserOp.initCode) {
    throw new Error("Deploy user op has no init code");
  }

  const initData = decodeFunctionData({
    abi: smartWalletFactoryAbi,
    data: ("0x" + deployUserOp.initCode.slice(42)) as `0x${string}`,
  });

  if (initData.functionName !== "createAccount") {
    throw new Error("Invalid init code");
  }

  const initialOwners = initData.args[0];

  console.log("addOwnerUserOps", addOwnerUserOps);

  let nextAddOwnerIndex = initialOwners.length;

  console.log(
    `Account will be initialized with ${initialOwners.length} owners`
  );

  console.log("deploy tx", {
    to: deployUserOp.initCode.slice(0, 42) as `0x${string}`,
    data: ("0x" + deployUserOp.initCode.slice(42)) as `0x${string}`,
  });

  const isDeployed = await targetClient.getCode({
    address,
  });

  if (isDeployed) {
    console.log("Account already deployed");

    const ownerCount = await targetClient.readContract({
      abi: smartWalletAbi,
      functionName: "ownerCount",
      address,
    });

    // TODO: Check how many owners and if indexes consistent with AddOwner events

    nextAddOwnerIndex = Number(ownerCount);
  } else {
    console.log("Account not deployed, deploying...");

    // Deploy smart account
    const deployTx = await targetWalletClient.sendTransaction({
      to: deployUserOp.initCode.slice(0, 42) as `0x${string}`,
      data: ("0x" + deployUserOp.initCode.slice(42)) as `0x${string}`,
    });

    const receipt = await targetClient.waitForTransactionReceipt({
      hash: deployTx,
    });

    if (receipt.status !== "success") {
      throw new Error("Deployment failed");
    }
  }

  console.log("replaying from index", nextAddOwnerIndex);

  if (
    addOwnerUserOps.slice(nextAddOwnerIndex, nextAddOwnerIndex + 1).length === 0
  ) {
    return 0;
  }

  console.log("all addOwnerUserOps", addOwnerUserOps);

  // TODO: Makes the typechecker happy on handleOps, not sure if this is correct
  const userOpsToReplay = addOwnerUserOps.slice(nextAddOwnerIndex).map((userOp) => {
    return {
      ...userOp,
      initCode: userOp.initCode ?? "0x",
      paymasterAndData: userOp.paymasterAndData ?? "0x",
    };
  });

  console.log("replaying ", userOpsToReplay);

  userOpsToReplay.forEach((userOp) => {
    const nonce = userOp.nonce & BigInt(0xfffffffff);

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

  const gas = BigInt(500_000);
  const gasPrice = await targetClient.getGasPrice();
  const gasCost = gas * gasPrice;

  console.log("gasCost", formatEther(gasCost));

  // Estimate gas for handleOps
  // const gas = await targetClient.estimateGas({
  //   to: entryPoint06Address,
  //   data: encodeFunctionData({
  //     abi: entryPoint06Abi,
  //     functionName: "handleOps",
  //     args: [userOpsToReplay, address],
  //   }),
  // });

  // const gasPrice = await targetClient.getGasPrice();

  // const gasCost = gas * gasPrice;

  // console.log(
  //   `Gas cost: ${formatEther(gasCost)} ETH (${formatEther(gas)} gas)`
  // );

  console.log("handleOps tx", {
    to: entryPoint06Address,
    data: encodeFunctionData({
      abi: entryPoint06Abi,
      functionName: "handleOps",
      args: [userOpsToReplay, address],
    }),
  });

  // Replay all the userOps on target chain
  const handleOpsTx = await targetWalletClient.writeContract({
    abi: entryPoint06Abi,
    address: entryPoint06Address,
    functionName: "handleOps",
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
