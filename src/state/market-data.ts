import { RISK_TTL_MS } from '../constants.js'
import type { BorrowerCandidate } from '../discovery/borrowers.js'
import type { Asset, Market } from '../market.js'
import type { Api } from './client.js'

export function createMarketSource(api: Api, poolId: bigint, now = Date.now) {
  let cached:
    | {
        pool: Market['pool']
        minResidualDebtValue: Market['minResidualDebtValue']
        assets: Map<string, Asset>
        at: number
      }
    | undefined

  return async (candidates: BorrowerCandidate[]): Promise<Market> => {
    const denoms = [
      ...new Set(
        candidates.flatMap(c => [
          ...c.borrows.map(b => b.denom),
          ...c.collaterals.map(a => a.denom)
        ])
      )
    ]

    if (!cached || now() - cached.at >= RISK_TTL_MS) {
      const [pool, params] = await Promise.all([api.pool(poolId), api.params()])
      if (pool.liquidationFeeRate === null) throw new Error('pool liquidation fee rate unavailable')

      cached = {
        pool: { ...pool, liquidationFeeRate: pool.liquidationFeeRate },
        minResidualDebtValue: params.minResidualDebtValue,
        assets: new Map(),
        at: now()
      }
    }

    // Fetch uncached asset terms without mutating the cache until the read succeeds.
    const terms = new Map(cached.assets)
    await Promise.all(
      denoms
        .filter(denom => !terms.has(denom))
        .map(async denom => {
          terms.set(denom, await api.asset(poolId, denom))
        })
    )

    // Never use cached prices for the current opportunity ranking.
    const prices = await Promise.all(denoms.map(denom => api.price(poolId, denom)))
    const assets = new Map<string, Asset & { price: (typeof prices)[number] }>()

    denoms.forEach((denom, i) => {
      const price = prices[i]
      const asset = terms.get(denom)
      if (!price || !asset) throw new Error(`market data missing: ${denom}`)
      if (!price.isPositive()) throw new Error(`oracle price unavailable: ${denom}`)
      assets.set(denom, { ...asset, price })
    })

    cached.assets = terms

    return {
      pool: cached.pool,
      minResidualDebtValue: cached.minResidualDebtValue,
      assets
    }
  }
}
