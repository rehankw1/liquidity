import { ApiV3PoolInfoStandardItemCpmm, CpmmKeys, Percent, getPdaPoolAuthority, CpmmRpcData, CurveCalculator  } from '@raydium-io/raydium-sdk-v2'
import BN from 'bn.js'
import { initSdk, txVersion } from '../config'
import Decimal from 'decimal.js'
import { isValidCpmm } from './utils'
import { NATIVE_MINT } from '@solana/spl-token'

export const deposit = async () => {
  const raydium = await initSdk(process.env.PRIVATE_KEY as string)

  const poolId = '6gYHH5fV3ompi63UuVzAA2Z7zskNuzxnwaN1PUkMw9k9'
  let poolInfo: ApiV3PoolInfoStandardItemCpmm
  let poolKeys: CpmmKeys | undefined

  if (raydium.cluster === 'mainnet') {
    // note: api doesn't support get devnet pool info, so in devnet else we go rpc method
    // if you wish to get pool info from rpc, also can modify logic to go rpc method directly
    const data = await raydium.api.fetchPoolById({ ids: poolId })
    poolInfo = data[0] as ApiV3PoolInfoStandardItemCpmm
    if (!isValidCpmm(poolInfo.programId)) throw new Error('target pool is not CPMM pool')
  } else {
    const data = await raydium.cpmm.getPoolInfoFromRpc(poolId)
    poolInfo = data.poolInfo
    poolKeys = data.poolKeys
  }

  console.log(123123444, poolInfo)

  const uiInputAmount = '20'
  const inputAmount = new BN(new Decimal(uiInputAmount).mul(10 ** poolInfo.mintA.decimals).toFixed(0))
  const slippage = new Percent(1, 100) // 1%
  const baseIn = true

  try {
    const { execute } = await raydium.cpmm.addLiquidity({
      poolInfo,
      poolKeys,
      inputAmount,
      slippage,
      baseIn,
      txVersion,
      // optional: set up priority fee here
      // computeBudgetConfig: {
      //   units: 600000,
      //   microLamports: 46591500,
      // },
    });
  
    // don't want to wait confirm, set sendAndConfirm to false or don't pass any params to execute
    const { txId } = await execute({ sendAndConfirm: false });
    console.log('pool deposited', { txId: `https://explorer.solana.com/tx/${txId}` });
    startBuy()
  } catch (error) {
    console.error('An error occurred while adding liquidity:', JSON.stringify(error, null, 2));  
  }

}

async function startBuy(){
    try {
        const walletSecretKeys: string[] = []; //add all wallets keys in this array
        const input = '100000000' //1 sol
        for (let i = 0; i < walletSecretKeys.length; i++) {
            const privKey = walletSecretKeys[i];
            const result = BuyToken(input, privKey); //not using await here to run all swaps in parallel
            console.log('result', result);
        }
        
    } catch (error) {
        console.log(error)
    }
}

async function BuyToken(input: string, privKey: string) {
    try {
        const raydium = await initSdk(privKey)

        console.log("Buying Token", input);

        const poolId = '6gYHH5fV3ompi63UuVzAA2Z7zskNuzxnwaN1PUkMw9k9'
        const inputAmount = new BN(input)
        const inputMint = NATIVE_MINT.toBase58()
      
        let poolInfo: ApiV3PoolInfoStandardItemCpmm
        let poolKeys: CpmmKeys | undefined
        let rpcData: CpmmRpcData
      
        if (raydium.cluster === 'mainnet') {
            const data = await raydium.api.fetchPoolById({ ids: poolId })
            poolInfo = data[0] as ApiV3PoolInfoStandardItemCpmm
            if (!isValidCpmm(poolInfo.programId)) throw new Error('target pool is not CPMM pool')
            rpcData = await raydium.cpmm.getRpcPoolInfo(poolInfo.id, true)
        } else {
            const data = await raydium.cpmm.getPoolInfoFromRpc(poolId)
            poolInfo = data.poolInfo
            poolKeys = data.poolKeys
            rpcData = data.rpcData
        }
      
        if (inputMint !== poolInfo.mintA.address && inputMint !== poolInfo.mintB.address)
            throw new Error('input mint does not match pool')
      
        const baseIn = inputMint === poolInfo.mintA.address
      
        // swap pool mintA for mintB
        const swapResult = CurveCalculator.swap(
            inputAmount,
            baseIn ? rpcData.baseReserve : rpcData.quoteReserve,
            baseIn ? rpcData.quoteReserve : rpcData.baseReserve,
            rpcData.configInfo!.tradeFeeRate
        )
      
        const { execute } = await raydium.cpmm.swap({
            poolInfo,
            poolKeys,
            inputAmount,
            swapResult,
            slippage: 0.001,
            baseIn,
            computeBudgetConfig: {
                units: 730000,
                microLamports: 5899150,
            },
        })
      
        const { txId } = await execute({ sendAndConfirm: true })
        console.log(`swapped: ${poolInfo.mintA.symbol} to ${poolInfo.mintB.symbol}:`, {
            txId: `https://explorer.solana.com/tx/${txId}`,
        })

        return swapResult.destinationAmountSwapped.toString();

    } catch (error) {
        console.error(error)
    }
}

/** uncomment code below to execute */
deposit()