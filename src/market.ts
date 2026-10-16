import Decimal from 'decimal.js'
import { z } from 'zod'

// Keep liquidation arithmetic deterministic and precise beyond token decimals.
export const D = Decimal.clone({
  precision: 200,
  rounding: Decimal.ROUND_DOWN
})

export type Dec = InstanceType<typeof D>

// Validate API decimals at the boundary before they enter profit calculations.
export const dec = z
  .string()
  .regex(/^-?\d+(?:\.\d{1,18})?$/)
  .transform(value => new D(value))

export const poolSchema = z.object({
  targetHealthFactor: dec,
  minBonus: dec,
  maxBonusHealthFactor: dec,
  liquidationFeeRate: dec.nullable()
})
export const paramsSchema = z.object({ minResidualDebtValue: dec })

export const assetSchema = z.object({
  liquidationThreshold: dec,
  maxBonus: dec
})
export const oracleSchema = z.object({ price: dec })

export type Pool = z.infer<typeof poolSchema>
export type Asset = z.infer<typeof assetSchema>
export type Market = {
  pool: Pool & { liquidationFeeRate: Dec }
  minResidualDebtValue: Dec
  assets: ReadonlyMap<string, Asset & { price: Dec }>
}

export type Opportunity = {
  borrower: string
  poolId: bigint
  repayDenom: string
  seizeDenom: string
  repay: bigint
  repayRequest: bigint
  seize: bigint
  fee: bigint
  profitUsd: Dec
  returnRate: Dec
}
