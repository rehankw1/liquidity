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

  const mintA = await raydium.token.getTokenInfo('regUhfQcL8eepui3rt8muxtjCRzkR3mM52yeCoP4mme')
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
    // computeBudgetConfig: {
    //   units: 600000,
    //   microLamports: 46591500,
    // },
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
      const walletSecretKeys: string[] = []; //add all wallets keys in this array
      const input = '100000000' //1 sol
      for (let i = 0; i < walletSecretKeys.length; i++) {
          const privKey = walletSecretKeys[i];
          const result = BuyToken(input, privKey, poolId); //not using await here to run all swaps in parallel
          console.log('result', result);
      }
      
  } catch (error) {
      console.log(error)
  }
}

async function BuyToken(input: string, privKey: string, poolId: string) {
  try {
      const raydium = await initSdk(privKey)

      console.log("Buying Token", input);
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

async function main(){
  await createPool();
}