import { ApiV3PoolInfoStandardItemCpmm, CpmmKeys, Percent, getPdaPoolAuthority, CurveCalculator } from '@raydium-io/raydium-sdk-v2'
import BN from 'bn.js'
import { initSdk, txVersion } from '../config'
import Decimal from 'decimal.js'
import { isValidCpmm } from './utils'
import { VersionedTransaction, TransactionInstruction, TransactionMessage, Keypair, MessageV0, Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58'
import 'dotenv/config'
import { e } from '@raydium-io/raydium-sdk-v2/lib/api-f6d3edc7'

const connection = new Connection('https://devnet.helius-rpc.com/?api-key=0fb097be-11d3-4376-b40a-d80d475aa336', 'processed');

const SOL_DECIMALS = 10 ** 9;

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

        const walletSecretKeys = [
            '5fsgrScPA1HYpX7Tv5MPhBzNC3VwGpe5FoNTn4NrpFs5D3syxVmtXDsJcAKERQq7xh7SVLSktueDMACTgurk63Ad',
            '4iMm7bLNRcHC43HDhncyafWwpmhDia4puymMuLo8qMeZXVAW1DWvojp69RCATPAGAfN5ZvXt54Gr7E5vFDEbpZD8',
            '2qTMGEsZQD76cPDmY3w1Qi625Skvzphmr2AQowVY2C6Crw6yjQrh2A2J4UtSPMHVJ5AeB5SatavXZGfWvB4Mj7iS',
            '5UJsSbxw1UFJjdENR8UGkiBhv988Npw8YMBmLpLw4u8vDCrTNE6smxAFnYeQqhWxyeWXRkVTZEfJmWf5wf8zY7Du',
            '5BPtC9HhfMqEuZr1PcZ77jtHbWCEq8jFn1d3uTAK9Uwfbpvvk5J9V8h2zrWJRoWEpycLtduFqEdQzcjZx7EVpbmt',
            '5RNkzQybyCGfWaVVRVdZJZvENrnPbwoybSiZCXgmDSkwpoQymSbq4HHE5TMUW2q4mHkMAqBW46a13vZrzn66rABm',
            'yQRVxGhjhp5mAxR9AbS38BjHig7K8Gcj1AwFLdFAUz7PtY7afD7v2527ryAcZSNg5Ft59BiS99gBPFWXZ8A4Ln6',
            '2JeBQNJ93DMUb47MvfeRXp8hrmR8YFFGT48gPHZuScpCLtpvcWs6pVD5STGkg77QjaJJT7nG6qVddKEmQb99xjfh',
            '296E4EWWsKc67ThBD2CggkfnejyeN1uUjQ9bZQSgz3jvuVDCbLReJzXCXaDQg7wA8FqAk2ZkJBFLvmHXShT8r2Uj',
            '2bZVtpk86jCSW8gMKGyQpgywWqstEb9oU1o1Y5XLfceiJZn6RKN8LF7koAXPXPUXvWd6fGNyyam4YFGaEXmaMrQs'
        ];
        const swapWallets = walletSecretKeys.map((key) => Keypair.fromSecretKey(bs58.decode(key)));

        const data = await raydium.cpmm.getPoolInfoFromRpc(poolId);
        poolInfo = data.poolInfo;
        poolKeys = data.poolKeys;

        const rpcData = data.rpcData;

        // console.log(rpcData, "rpcData");
        // return

        const input = '0.0006';

        const userMintAAmount = new BN(new Decimal(input).mul(10 ** poolInfo.mintA.decimals).toFixed(0));

        const mintAInPool = poolInfo.mintAmountA;
        const mintBInPool = poolInfo.mintAmountB;
        const priceOfMintAInMintB = poolInfo.price;

        const equivalentMintBAmount = new Decimal(userMintAAmount.toString())
            .mul(priceOfMintAInMintB)
            .div(new Decimal(10 ** poolInfo.mintA.decimals));

        const equivalentMintBAmountInLamports = equivalentMintBAmount.mul(SOL_DECIMALS);    

        console.log(equivalentMintBAmountInLamports, "equivalentMintBAmount"); 

        // console.log(mintAInPool, mintBInPool, "mintAInPool, mintBInPool");

        const currentBaseReserve = rpcData.baseReserve;
        const currentQuoteReserve = rpcData.quoteReserve;
        console.log(currentBaseReserve.toNumber(), currentQuoteReserve.toNumber(), "currentBaseReserve, currentQuoteReserve");

        const updatedBaseReserve = currentBaseReserve.add(userMintAAmount); 
        const updatedQuoteReserve = currentQuoteReserve.add(new BN(equivalentMintBAmountInLamports.toFixed(0))); 

        console.log(updatedBaseReserve.toNumber(), updatedQuoteReserve.toNumber(), "updatedBaseReserve, updatedQuoteReserve");
        // return


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

        const swapTransactions = [];
        for(const wallet of swapWallets) {

            const walletRaydium = await initSdk(bs58.encode(wallet.secretKey));

            const outputAmount = new BN('10000000000000');
            const outputMint = "zaQ4ttf2HRQ7M8yj5Bg53phRnDoLbXfssBxXJdyD7gb";
    
            const swapResult = CurveCalculator.swapBaseOut({
                poolMintA: poolInfo.mintA,
                poolMintB: poolInfo.mintB,
                tradeFeeRate: rpcData.configInfo!.tradeFeeRate,
                baseReserve: updatedBaseReserve,
                quoteReserve: updatedQuoteReserve,
                outputMint,
                outputAmount,
            });

            const { execute: swapExecute, transaction: swapTransaction } = await walletRaydium.cpmm.swap({
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

            swapTransactions.push(transactionSwap);
        }

        const addLiquiditySignature = connection.sendTransaction(addTransaction);
            await new Promise((resolve) => setTimeout(resolve, 400)); // 400ms delay
        for (const swapTransaction of swapTransactions) {
            const swapSignature = connection.sendTransaction(swapTransaction);
            console.log("Swap Transaction Signature:", swapSignature);
        }


        return;
    } catch (error) {
        console.error("Error in depositAndSwap:", error);
    }
};

depositAndSwap();