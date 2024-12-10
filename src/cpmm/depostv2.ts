import {
    ApiV3PoolInfoStandardItemCpmm,
    CpmmKeys,
    Percent,
    CurveCalculator,
} from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import { initSdk, txVersion } from '../config';
import Decimal from 'decimal.js';
import {
    VersionedTransaction,
    Keypair,
    Connection,
} from '@solana/web3.js';
import bs58 from 'bs58';
import 'dotenv/config';

// Connection to Solana Devnet
const connection = new Connection(
    'https://devnet.helius-rpc.com/?api-key=0fb097be-11d3-4376-b40a-d80d475aa336',
    'processed'
);

export const depositAndSwap = async () => {
    try {
        // Load main wallet and initialize SDK
        const privKey = process.env.PRIVATE_KEY as string;
        const raydium = await initSdk(privKey);
        const mainWallet = Keypair.fromSecretKey(bs58.decode(privKey));

        // Array of secret keys for swap wallets
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

        const poolId = 'cb8nxgw1pSR61J193ZTczaAqXqqH19wGtceKBqQvSPL';

        let poolInfo: ApiV3PoolInfoStandardItemCpmm;
        let poolKeys: CpmmKeys | undefined;

        const data = await raydium.cpmm.getPoolInfoFromRpc(poolId);
        poolInfo = data.poolInfo;
        poolKeys = data.poolKeys;

        // console.log("Pool Info:", poolInfo);

        const rpcData = data.rpcData;

        const input = '0.006';

        const userMintAAmount = new BN(new Decimal(input).mul(10 ** poolInfo.mintA.decimals).toFixed(0));

        const mintAInPool = poolInfo.mintAmountA;
        const mintBInPool = poolInfo.mintAmountB;
        const priceOfMintAInMintB = poolInfo.price;

        const equivalentMintBAmount = new Decimal(userMintAAmount.toString())
            .mul(priceOfMintAInMintB)
            .div(new Decimal(10 ** poolInfo.mintA.decimals));
        const userMintBAmount = new BN(equivalentMintBAmount.toFixed(0));

        const updatedBaseReserve = new BN(mintAInPool).add(userMintAAmount); // New base reserve (mintA)
        const updatedQuoteReserve = new BN(mintBInPool).add(userMintBAmount); // New quote reserve (mintB)

        const slippage = new Percent(1, 100);
        const baseIn = true;

        // Create Add Liquidity Transaction
        const { transaction: addLiquidityTransaction } = await raydium.cpmm.addLiquidity({
            poolInfo,
            poolKeys,
            inputAmount: userMintAAmount,
            slippage,
            baseIn,
            txVersion,
        });

        const addTransaction = new VersionedTransaction(addLiquidityTransaction.message);
        addTransaction.sign([mainWallet]);

        // Initialize base and quote reserves
        let currentBaseReserve = updatedBaseReserve;
        let currentQuoteReserve = updatedQuoteReserve;

        // Create Swap Transactions for each wallet
        const swapTransactions = [];
        for (const wallet of swapWallets) {
            const outputAmount = new BN('100000000'); // Output amount after swap
            const outputMint = poolInfo.mintB.address;

            const walletRaydium = await initSdk(bs58.encode(wallet.secretKey));

            const swapResult = CurveCalculator.swapBaseOut({
                poolMintA: poolInfo.mintA,
                poolMintB: poolInfo.mintB,
                tradeFeeRate: rpcData.configInfo!.tradeFeeRate,
                baseReserve: currentBaseReserve,
                quoteReserve: currentQuoteReserve,
                outputMint,
                outputAmount,
            });

            console.log("swapResult.amountIn:", swapResult.amountIn.toString());
            console.log("outputAmount:", outputAmount.toString());

            console.log("currentBaseReserve:", currentBaseReserve.toString());
            console.log("currentQuoteReserve:", currentQuoteReserve.toString());

            const { transaction: swapTransaction } = await walletRaydium.cpmm.swap({
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



            const signedSwapTransaction = new VersionedTransaction(swapTransaction.message);
            signedSwapTransaction.sign([wallet]);
            swapTransactions.push(signedSwapTransaction);


            // Update local reserves to simulate the pool's new state
            // if (outputMint === poolInfo.mintA.address) {
            //     currentBaseReserve = currentBaseReserve.sub(swapResult.amountIn);
            //     currentQuoteReserve = currentQuoteReserve.add(outputAmount);
            // } else {
            //     currentBaseReserve = currentBaseReserve.add(outputAmount);
            //     currentQuoteReserve = currentQuoteReserve.sub(swapResult.amountIn);
            // }
        }

        // Send Add Liquidity Transaction
        const addLiquiditySignature = connection.sendTransaction(addTransaction);
        console.log("Add Liquidity Transaction Signature:", addLiquiditySignature);

        // Delay and send Swap Transactions sequentially
        for (const swapTransaction of swapTransactions) {
            await new Promise((resolve) => setTimeout(resolve, 450)); // 400ms delay
            const swapSignature = connection.sendTransaction(swapTransaction);
            console.log("Swap Transaction Signature:", swapSignature);
        }

        return;
    } catch (error) {
        console.error("Error in depositAndSwap:", error);
    }
};

depositAndSwap();
