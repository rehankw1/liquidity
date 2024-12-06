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

export const createPool = async () => {
  const raydium = await initSdk(process.env.PRIVATE_KEY as string)

  const mintA = await raydium.token.getTokenInfo('nfa8GzC5wr3Xtm2qZrssQadeU8iHKEHjVeZmvoRFqXg')
  const mintB = await raydium.token.getTokenInfo('So11111111111111111111111111111111111111112')

  const feeConfigs = await raydium.api.getCpmmConfigs()

  if (raydium.cluster === 'devnet') {
    feeConfigs.forEach((config) => {
      config.id = getCpmmPdaAmmConfigId(DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM, config.index).publicKey.toBase58()
    })
  }

  const { execute, extInfo } = await raydium.cpmm.createPool({
    programId: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM, // mainnet: CREATE_CPMM_POOL_PROGRAM
    poolFeeAccount: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC, // mainnet:  CREATE_CPMM_POOL_FEE_ACC
    mintA,
    mintB,
    mintAAmount: new BN('100000000000000'),
    mintBAmount: new BN('6000000'),
    startTime: new BN(0),
    feeConfig: feeConfigs[0],
    associatedOnly: false,
    ownerInfo: {
      useSOLBalance: true,
    },
    txVersion,
    computeBudgetConfig: {
      units: 700000,
      microLamports: 46591500,
    },
  })

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

}

async function startBuy(poolId: string) {
  try {
      const walletSecretKeys: string[] = [

      ]; //add all wallets keys in this array
      const input = '10000000000000' //100,000
      for (let i = 0; i < walletSecretKeys.length; i++) {
          const privKey = walletSecretKeys[i];
          const result = await swapBaseOut(input, privKey, poolId); //not using await here to run all swaps in parallel
          console.log('result', result);
      }
      
  } catch (error) {
      console.log(error)
  }
}

export const swapBaseOut = async (input: string, privKey: string, poolId: string) => {
  const raydium = await initSdk(privKey)

  const outputAmount = new BN('1668338')
  const outputMint = "So11111111111111111111111111111111111111112"

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

  if (outputMint !== poolInfo.mintA.address && outputMint !== poolInfo.mintB.address)
    throw new Error('input mint does not match pool')

  console.log(poolInfo, "================")

  const baseIn = outputMint === poolInfo.mintB.address

  const swapResult = CurveCalculator.swapBaseOut({
    poolMintA: poolInfo.mintA,
    poolMintB: poolInfo.mintB,
    tradeFeeRate: rpcData.configInfo!.tradeFeeRate,
    baseReserve: rpcData.baseReserve,
    quoteReserve: rpcData.quoteReserve,
    outputMint,
    outputAmount,
  })

  const { execute, transaction } = await raydium.cpmm.swap({
    poolInfo,
    poolKeys,
    inputAmount: new BN(0), // if set fixedOut to true, this arguments won't be used
    fixedOut: true,
    swapResult: {
      sourceAmountSwapped: swapResult.amountIn,
      destinationAmountSwapped: outputAmount,
    },
    baseIn,
    txVersion,
    slippage: 0.1, 
    // optional: set up priority fee here
    computeBudgetConfig: {
      units: 710000,
      microLamports: 5859150,
    },
  })

try {
  const { txId } = await execute({ sendAndConfirm: true })
  console.log(`swapped: ${poolInfo.mintA.symbol} to ${poolInfo.mintB.symbol}:`, {
    txId: `https://explorer.solana.com/tx/${txId}`,
  })
} catch (error) {
  console.log(error)
}

}

async function main(){
  // const poolId = await createPool();
  await startBuy('AYhpje7gHcqQ58bqGUHHUibKkuECEgQUomn2Ho13YwT6');
}

main();