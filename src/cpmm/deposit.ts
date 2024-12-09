import { ApiV3PoolInfoStandardItemCpmm, CpmmKeys, Percent, getPdaPoolAuthority, CurveCalculator } from '@raydium-io/raydium-sdk-v2'
import BN from 'bn.js'
import { initSdk, txVersion } from '../config'
import Decimal from 'decimal.js'
import { isValidCpmm } from './utils'
import { VersionedTransaction, TransactionInstruction, TransactionMessage, Keypair, MessageV0, Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58'
import 'dotenv/config'
import BufferLayout from '@solana/buffer-layout';

const connection = new Connection(process.env.RPC_URL as string, 'processed');


export const deposit = async () => {
  const raydium = await initSdk(process.env.PRIVATE_KEY as string)
  const wallet = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY as string));


  const poolId = 'cb8nxgw1pSR61J193ZTczaAqXqqH19wGtceKBqQvSPL'
  let poolInfo: ApiV3PoolInfoStandardItemCpmm
  let poolKeys: CpmmKeys | undefined

    const data = await raydium.cpmm.getPoolInfoFromRpc(poolId)
    poolInfo = data.poolInfo
    poolKeys = data.poolKeys

  console.log(123123444, poolInfo)

  const uiInputAmount = '0.0001'
  const inputAmount = new BN(new Decimal(uiInputAmount).mul(10 ** poolInfo.mintA.decimals).toFixed(0))
  const slippage = new Percent(1, 100) // 1%
  const baseIn = true

  const { execute, transaction } = await raydium.cpmm.addLiquidity({
    poolInfo,
    poolKeys,
    inputAmount,
    slippage,
    baseIn,
    txVersion,
  })

  const solTransaction = new VersionedTransaction(transaction.message);
    console.log("solTransaction", solTransaction);
    
    solTransaction.sign([wallet]);
    
    const signature = await connection.sendTransaction(solTransaction);
    console.log("Transaction Signature:", signature);

}

export const depositAndSwap = async () => {
    try {
        const privKey = process.env.PRIVATE_KEY as string;
        const raydium = await initSdk(privKey);
        const wallet = Keypair.fromSecretKey(bs58.decode(privKey as string));
        const poolId = 'cb8nxgw1pSR61J193ZTczaAqXqqH19wGtceKBqQvSPL';

        let poolInfo: ApiV3PoolInfoStandardItemCpmm;
        let poolKeys: CpmmKeys | undefined;

        const data = await raydium.cpmm.getPoolInfoFromRpc(poolId);
        poolInfo = data.poolInfo;
        poolKeys = data.poolKeys;

        const rpcData = data.rpcData;

        const input = '0.0001';

        const userMintAAmount = new BN(new Decimal(input).mul(10 ** poolInfo.mintA.decimals).toFixed(0));

        const mintAInPool = poolInfo.mintAmountA;
        const mintBInPool = poolInfo.mintAmountB;
        const priceOfMintAInMintB = poolInfo.price;

        const equivalentMintBAmount = new Decimal(userMintAAmount.toString()).mul(priceOfMintAInMintB).div(new Decimal(10 ** poolInfo.mintA.decimals));
        const userMintBAmount = new BN(equivalentMintBAmount.toFixed(0));

        const updatedBaseReserve = new BN(mintAInPool).add(userMintAAmount); // New base reserve (mintA)
        const updatedQuoteReserve = new BN(mintBInPool).add(userMintBAmount); // New quote reserve (mintB)

        const slippage = new Percent(1, 100);
        const baseIn = true;

        // Add liquidity
        const { execute, transaction: addLiquidityTransaction } = await raydium.cpmm.addLiquidity({
            poolInfo,
            poolKeys,
            inputAmount: userMintAAmount,
            slippage,
            baseIn,
            txVersion,
        });

        const addTransaction = new VersionedTransaction(addLiquidityTransaction.message);
        addTransaction.sign([wallet]);
        // const addSignature = await connection.sendTransaction(addTransaction);
        // console.log("Add Liquidity Transaction Signature:", addSignature);

        // Calculate the swap result using updated reserves
        const outputAmount = new BN('100000000'); // Output amount after swap
        const outputMint = poolInfo.mintA.address; // Assuming swap to mintA

        const swapResult = CurveCalculator.swapBaseOut({
            poolMintA: poolInfo.mintA,
            poolMintB: poolInfo.mintB,
            tradeFeeRate: rpcData.configInfo!.tradeFeeRate,
            baseReserve: updatedBaseReserve,
            quoteReserve: updatedQuoteReserve,
            outputMint,
            outputAmount,
        });

        // Now execute the swap
        const { execute: swapExecute, transaction: swapTransaction } = await raydium.cpmm.swap({
            poolInfo,
            poolKeys,
            inputAmount: swapResult.amountIn,
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

        const transactionSwap = new VersionedTransaction(swapTransaction.message);
        transactionSwap.sign([wallet]);

        const serialized = addTransaction.serialize();
        console.log('Transaction size:', serialized.length);
        return

        // const addLiquiditySignature = connection.sendTransaction(addTransaction);
        // console.log("Add Liquidity Transaction Signature:", addLiquiditySignature);
        // await new Promise((resolve) => setTimeout(resolve, 500));
        // const swapSignature = connection.sendTransaction(transactionSwap);
        // console.log("Swap Transaction Signature:", swapSignature);

        return;


        console.log("Add Liquidity Transaction:", addLiquidityTransaction);
        console.log("Swap Transaction:", swapTransaction);


        // Combine the add liquidity and swap transactions into one
        const combinedInstructions = [
            ...addLiquidityTransaction.message.compiledInstructions,
            ...swapTransaction.message.compiledInstructions
        ];

        const combinedMessage = new MessageV0({
            header: {
                numRequiredSignatures: 1,
                numReadonlySignedAccounts: 0,
                numReadonlyUnsignedAccounts: 10,
            },
            staticAccountKeys: [
                ...addLiquidityTransaction.message.staticAccountKeys,
                ...swapTransaction.message.staticAccountKeys,
            ],
            compiledInstructions: combinedInstructions,
            recentBlockhash: swapTransaction.message.recentBlockhash,
            addressTableLookups: addLiquidityTransaction.message.addressTableLookups,
        });


        const combinedTransaction = new VersionedTransaction(combinedMessage);
        // const serialized = combinedTransaction.serialize();
        // console.log('Transaction size:', serialized.length);
        return

        const latestBlockhash = await connection.getLatestBlockhash();
        combinedMessage.recentBlockhash = latestBlockhash.blockhash;
        

        combinedTransaction.sign([wallet]);



        const signature = await connection.sendTransaction(combinedTransaction);
        console.log("Combined Transaction Signature:", signature);
    } catch (error) {
        console.error("Error in depositAndSwap:", error);
    }
};

function removeDuplicateKeys(keys: PublicKey[]): PublicKey[] {
    const uniqueKeys: PublicKey[] = [];
    const seenKeys = new Set<string>();

    for (const key of keys) {
        const keyString = key.toBase58();
        if (!seenKeys.has(keyString)) {
            uniqueKeys.push(key);
            seenKeys.add(keyString);
        }
    }

    return uniqueKeys;
}

//@ts-ignore
const decodeInstruction = (data) => {
    try {
      const layout = BufferLayout.struct<{ version: number; payload: Buffer }>([
        BufferLayout.u8('version'),
        //@ts-ignore
        BufferLayout.blob<Buffer>(data.length - 1, 'payload'),
      ]);
      return layout.decode(data);
    } catch (error) {
      console.error("Error decoding instruction:", error);
      return null;
    }
  };

depositAndSwap();