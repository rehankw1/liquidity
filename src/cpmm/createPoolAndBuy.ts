import {
  CREATE_CPMM_POOL_PROGRAM,
  CREATE_CPMM_POOL_FEE_ACC,
  DEVNET_PROGRAM_ID,
  getCpmmPdaAmmConfigId,
} from '@raydium-io/raydium-sdk-v2'
import { ApiV3PoolInfoStandardItemCpmm, CpmmKeys, Percent, getPdaPoolAuthority, CpmmRpcData, CurveCalculator  } from '@raydium-io/raydium-sdk-v2'
import BN from 'bn.js'
import { initSdk, txVersion } from '../config'
import Decimal from 'decimal.js'
import { isValidCpmm } from './utils'
import { NATIVE_MINT } from '@solana/spl-token'
import bs58 from 'bs58'
import { VersionedTransaction, TransactionInstruction, TransactionMessage, Keypair, MessageV0, Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection('https://devnet.helius-rpc.com/?api-key=0fb097be-11d3-4376-b40a-d80d475aa336', 'confirmed');



export const createPool = async () => {
  const raydium = await initSdk(process.env.PRIVATE_KEY as string)

  const mintA = await raydium.token.getTokenInfo('zaQ4ttf2HRQ7M8yj5Bg53phRnDoLbXfssBxXJdyD7gb')
  const mintB = await raydium.token.getTokenInfo('So11111111111111111111111111111111111111112')

  const feeConfigs = await raydium.api.getCpmmConfigs()

  if (raydium.cluster === 'devnet') {
    feeConfigs.forEach((config) => {
      config.id = getCpmmPdaAmmConfigId(DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM, config.index).publicKey.toBase58()
    })
  }
  
  const { execute, extInfo } = await raydium.cpmm.createPool({
    programId: raydium.cluster == 'devnet' ? DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM : CREATE_CPMM_POOL_PROGRAM,
    poolFeeAccount: raydium.cluster == 'devnet' ? DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC : CREATE_CPMM_POOL_FEE_ACC,
    mintA,
    mintB,
    mintAAmount: new BN('100000000000'),
    mintBAmount: new BN('6000'),
    startTime: new BN(0),
    feeConfig: feeConfigs[0],
    associatedOnly: false,
    ownerInfo: {
      useSOLBalance: true,
    },
    txVersion,
  })

  try {
    const { txId } = await execute({ sendAndConfirm: true })
    console.log('pool created', {
      txId,
      poolKeys: Object.keys(extInfo.address).reduce(
        (acc, cur) => ({
          ...acc,
          [cur]: extInfo.address[cur as keyof typeof extInfo.address].toString(),
        }),
        {}
      ),
      
    })
  
    const poolId = Object.keys(extInfo.address).reduce(
        (acc, cur) => ({
          ...acc,
          [cur]: extInfo.address[cur as keyof typeof extInfo.address].toString(),
        }),
        {} as { [key: string]: string }
      ).poolId;
  
      return poolId;
  } catch (error) {
    console.log("error",error)
    return null
  }

  

}

async function startBuy(poolId: string) {
  try {
      const walletSecretKeys: string[] = [
       
      ]; //add all wallets keys in this array
      const input = '100000000' //100,000
      const privKey = walletSecretKeys[0];
      const secondPrivKey = walletSecretKeys[1];
      const result = await swapBaseOut(input, privKey, poolId, secondPrivKey);
      // for (let i = 0; i < 1; i++) {
      //     const privKey = walletSecretKeys[i];
      //     const result = await swapBaseOut(input, privKey, poolId); //not using await here to run all swaps in parallel
      //     console.log('result', result);
      // }
      
  } catch (error) {
      console.log(error)
  }
}

//@ts-ignore
export const swapBaseOut = async (input, privKey, poolId, secondPrivKey) => {
  const raydium = await initSdk(privKey);
  const secondRaydium = await initSdk(secondPrivKey); // Initialize for the second wallet
  const wallet = Keypair.fromSecretKey(bs58.decode(privKey));
  const secondWallet = Keypair.fromSecretKey(bs58.decode(secondPrivKey));
  const outputAmount = new BN(input);
  const outputMint = "zaQ4ttf2HRQ7M8yj5Bg53phRnDoLbXfssBxXJdyD7gb";

  const data = await raydium.cpmm.getPoolInfoFromRpc(poolId);
  const { poolInfo, poolKeys, rpcData } = data;

  if (outputMint !== poolInfo.mintA.address && outputMint !== poolInfo.mintB.address)
    throw new Error("input mint does not match pool");

  const baseIn = outputMint === poolInfo.mintB.address;

  const swapResult = CurveCalculator.swapBaseOut({
    poolMintA: poolInfo.mintA,
    poolMintB: poolInfo.mintB,
    tradeFeeRate: rpcData.configInfo!.tradeFeeRate,
    baseReserve: rpcData.baseReserve,
    quoteReserve: rpcData.quoteReserve,
    outputMint,
    outputAmount,
  });

  const { transaction: firstTransaction } = await raydium.cpmm.swap({
    poolInfo,
    poolKeys,
    inputAmount: new BN(0),
    fixedOut: true,
    swapResult: {
      sourceAmountSwapped: swapResult.amountIn,
      destinationAmountSwapped: outputAmount,
    },
    baseIn,
    txVersion,
    slippage: 1,
    computeBudgetConfig: {
      units: 710000,
      microLamports: 5859150,
    },
  });

  const { transaction: secondTransaction } = await secondRaydium.cpmm.swap({
    poolInfo,
    poolKeys,
    inputAmount: new BN(0),
    fixedOut: true,
    swapResult: {
      sourceAmountSwapped: swapResult.amountIn,
      destinationAmountSwapped: outputAmount,
    },
    baseIn,
    txVersion,
    slippage: 1,
    computeBudgetConfig: {
      units: 710000,
      microLamports: 5859150,
    },
  });

  const combinedInstructions = [
    ...firstTransaction.message.compiledInstructions,
    ...secondTransaction.message.compiledInstructions,
  ];

  const uniqueStaticAccountKeys = Array.from(
    new Set([
      ...firstTransaction.message.staticAccountKeys.map((key) => key.toBase58()),
      ...secondTransaction.message.staticAccountKeys.map((key) => key.toBase58()),
    ])
  ).map((key) => new PublicKey(key));
  
  const header = {
    numRequiredSignatures:
      firstTransaction.message.header.numRequiredSignatures +
      secondTransaction.message.header.numRequiredSignatures,
    numReadonlySignedAccounts:
      firstTransaction.message.header.numReadonlySignedAccounts +
      secondTransaction.message.header.numReadonlySignedAccounts,
    numReadonlyUnsignedAccounts:
      firstTransaction.message.header.numReadonlyUnsignedAccounts +
      secondTransaction.message.header.numReadonlyUnsignedAccounts,
  };
  
  const combinedAddressTableLookups = Array.from(
    new Set([
      ...(firstTransaction.message.addressTableLookups || []),
      ...(secondTransaction.message.addressTableLookups || []),
    ])
  );
  
  const combinedMessage = new MessageV0({
    header,
    staticAccountKeys: uniqueStaticAccountKeys,
    compiledInstructions: [
      ...firstTransaction.message.compiledInstructions,
      ...secondTransaction.message.compiledInstructions,
    ],
    recentBlockhash: secondTransaction.message.recentBlockhash,
    addressTableLookups: combinedAddressTableLookups,
  });
  
  const combinedTransaction = new VersionedTransaction(combinedMessage);

  console.log(wallet, secondWallet);
  
  combinedTransaction.sign([wallet, secondWallet]);
  
  const signature = await connection.sendTransaction(combinedTransaction);
  console.log("Combined Transaction Signature:", signature);

  // const combinedMessage = new MessageV0({
  //   header: {
  //     numRequiredSignatures: 2,
  //     numReadonlySignedAccounts: 0,
  //     numReadonlyUnsignedAccounts: 0,
  //   },
  //   staticAccountKeys: [
  //     ...firstTransaction.message.staticAccountKeys,
  //     ...secondTransaction.message.staticAccountKeys,
  //   ],
  //   compiledInstructions: combinedInstructions,
  //   recentBlockhash: secondTransaction.message.recentBlockhash,
  //   addressTableLookups: firstTransaction.message.addressTableLookups,
  // });

  // const combinedTransaction = new VersionedTransaction(combinedMessage);

  // combinedTransaction.sign([wallet, secondWallet]);

  // const signature = await connection.sendTransaction(combinedTransaction);
  // console.log("Combined Transaction Signature:", signature);

  return signature;
};

async function main(){
  // const poolId = await createPool();
  // if(poolId)  console.log("Pool created with id: ", poolId);
  await startBuy("cb8nxgw1pSR61J193ZTczaAqXqqH19wGtceKBqQvSPL");
}

main();


// const { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction } = require('@solana/web3.js');
// async function createVersionedTransaction() {
//     const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
//     const wallet = Keypair.generate();
//     const feePayer = wallet.publicKey;
//     const recentBlockhash = await connection.getLatestBlockhash();
//     // Create a TransactionMessage with instructions and recent blockhash
//     const message = new TransactionMessage({
//         feePayer: feePayer, // The account paying the transaction fees
//         recentBlockhash: recentBlockhash.blockhash, // The recent blockhash for the transaction
//         instructions: [] // Instructions would go here
//     });
//     // Create a VersionedTransaction
//     const versionedTransaction = new VersionedTransaction(message);
//     // Add your instructions to the versioned transaction
//     // You can use methods like add() or specific instruction objects to populate the instructions array
//     // Send or confirm transaction
//     // This is where you'd send the transaction, for example:
//     // const signature = await connection.sendTransaction(versionedTransaction, [wallet]);
//     console.log(versionedTransaction);
// }
// createVersionedTransaction();