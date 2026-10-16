import { createClient, createPrivateKeySigner, getNetworkConfig, msg } from 'ault-sdk-ts'
import type { Config } from '../config.js'
import { readPrivateKey } from '../config.js'
import type { Opportunity } from '../market.js'

export type Submit = (opportunity: Opportunity) => Promise<string>
export type Balances = (denoms: string[]) => Promise<ReadonlyMap<string, bigint>>

export async function createWallet(
  config: Config
): Promise<{ balances: Balances; submit: Submit; restUrl: string; close: () => void }> {
  if (!config.keyFile) throw new Error('KEY_FILE is required')

  const network = {
    ...getNetworkConfig(config.chainId),
    ...(config.rpcUrl ? { rpcUrl: config.rpcUrl } : {}),
    ...(config.restUrl ? { restUrl: config.restUrl } : {})
  }
  const signer = { type: 'privateKey' as const, key: await readPrivateKey(config.keyFile) }
  const txSigner = createPrivateKeySigner(signer.key)
  const client = await createClient({
    network,
    signer
  })

  return {
    restUrl: client.network.restUrl,
    async balances(denoms) {
      const entries = await Promise.all(
        denoms.map(async denom => {
          const response = await client.bank.getBalance(client.address, denom)
          return [denom, BigInt(response.balance?.amount ?? '0')] as const
        })
      )
      return new Map(entries)
    },
    async submit(opportunity) {
      const gas = client._resolver.currentGas()
      const result = await client._lowLevel.eip712.signAndBroadcast({
        signer: txSigner,
        signerAddress: client.address,
        msgs: [
          msg.lending.liquidate({
            liquidator: client.address,
            poolId: opportunity.poolId,
            borrower: opportunity.borrower,
            repay: {
              denom: opportunity.repayDenom,
              amount: opportunity.repayRequest.toString()
            },
            seizeDenom: opportunity.seizeDenom
          })
        ],
        gasLimit: (
          (BigInt(gas.LENDING_LIQUIDATE) * BigInt(gas.FEE_FREE_GAS_MULTIPLIER)) /
          100n
        ).toString(),
        wait: false
      })
      return result.txHash
    },
    close: () => client.dispose()
  }
}
