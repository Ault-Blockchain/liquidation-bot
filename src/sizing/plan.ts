import type { BorrowerCandidate } from '../discovery/borrowers.js'
import { D, type Market, type Opportunity } from '../market.js'
import { ceil, divDown, divUp, floor, min, mul, mulDown, units } from './math.js'

const ZERO = new D(0)
const ONE = new D(1)
const USD_SCALE = new D('1000000000000000000')
const REPAY_BUFFER_PERCENT = 1n

// Estimate the keeper's liquidationSize and liquidationFee with the same
// 18-decimal rounding steps. Amounts are raw token units; prices are USD per unit.
export function planLiquidation(
  candidate: BorrowerCandidate,
  debt: BorrowerCandidate['borrows'][number],
  collateral: BorrowerCandidate['collaterals'][number],
  market: Market,
  availableBalance: bigint
): Opportunity | undefined {
  if (
    debt.assets === 0n ||
    collateral.amount === 0n ||
    !candidate.borrowedValue.isPositive() ||
    candidate.healthFactor.gte(ONE)
  )
    return

  const repayAsset = market.assets.get(debt.denom)
  const seizeAsset = market.assets.get(collateral.denom)
  if (!repayAsset || !seizeAsset) throw new Error('candidate asset missing from market data')

  const {
    targetHealthFactor: target,
    minBonus,
    maxBonusHealthFactor: maxBonusHf,
    liquidationFeeRate: feeRate
  } = market.pool
  const hf = candidate.healthFactor

  // Bonus = MaxBonus when HF <= MaxBonusHF; otherwise interpolate down to MinBonus
  // as HF approaches 1: MinBonus + (MaxBonus - MinBonus) * (1 - HF) / (1 - MaxBonusHF).
  const bonus = hf.gt(maxBonusHf)
    ? minBonus.plus(
        divDown(mulDown(seizeAsset.maxBonus.minus(minBonus), ONE.minus(hf)), ONE.minus(maxBonusHf))
      )
    : seizeAsset.maxBonus
  const factor = ONE.plus(bonus)

  // Let D = total debt value, C = liquidation collateral value, LT = seized
  // asset threshold and F = 1 + bonus. Solving target HF after repayment gives:
  // RequiredRepayValue = (TargetHF * D - C) / (TargetHF - F * LT).
  const denominator = target.minus(mulDown(factor, seizeAsset.liquidationThreshold))
  const numerator = mulDown(target, candidate.borrowedValue).minus(
    candidate.liquidationCollateralValue
  )
  if (!denominator.isPositive() || !numerator.isPositive()) return

  const requiredValue = divDown(numerator, denominator)
  // Convert the USD repayment limit to raw units of the chosen debt asset.
  let repayLimit = floor(divDown(requiredValue, repayAsset.price))
  const residual = candidate.borrowedValue.minus(requiredValue)
  // If stopping at target HF leaves debt dust, allow clearing the selected debt.
  if (residual.gt(ZERO) && residual.lt(market.minResidualDebtValue)) repayLimit = debt.assets

  // CollateralRepayLimit = ceil(ceil(collateral * seizePrice / F) / repayPrice).
  // The chain rounds this limit UP, then caps the requested repay by all limits.
  const collateralLimit = ceil(
    divUp(divUp(mul(units(collateral.amount), seizeAsset.price), factor), repayAsset.price)
  )
  const repay = min(availableBalance, repayLimit, debt.assets, collateralLimit)
  if (repay <= 0n) return

  // BaseSeize = floor(repay * repayPrice / seizePrice).
  // Seize = min(floor(repay * repayPrice * F / seizePrice), collateral).
  // Seize uses DOWN rounding even though the collateral repay limit above uses UP.
  const repayValue = mul(units(repay), repayAsset.price)
  const baseSeize = floor(divDown(repayValue, seizeAsset.price))
  const seize = min(
    floor(divDown(mulDown(repayValue, factor), seizeAsset.price)),
    collateral.amount
  )
  if (seize <= 0n) return

  // ResidualDebtValue = total debt value - repay * repayPrice. The keeper rejects
  // dust unless this trade clears the selected debt or takes all selected collateral.
  const remaining = candidate.borrowedValue.minus(repayValue)
  if (
    remaining.gt(ZERO) &&
    remaining.lt(market.minResidualDebtValue) &&
    repay < debt.assets &&
    seize < collateral.amount
  )
    return

  // BonusSeize = Seize - min(Seize, BaseSeize); fee = floor(BonusSeize * feeRate).
  // Profit is the USD value of net collateral received minus USD debt repaid.
  // This excludes swap costs and transaction fees.
  const fee = floor(mulDown(units(seize - min(seize, baseSeize)), feeRate))
  const profitValue = mul(units(seize - fee), seizeAsset.price).minus(repayValue)
  if (!profitValue.isPositive()) return

  const repayRequest =
    repay === debt.assets ? (debt.assets * (100n + REPAY_BUFFER_PERCENT) + 99n) / 100n : repay
  if (repayRequest > availableBalance) return

  return {
    borrower: candidate.owner,
    poolId: candidate.poolId,
    repayDenom: debt.denom,
    seizeDenom: collateral.denom,
    repay,
    // Accrual can increase debt after the indexed snapshot. Request 1% more
    // when clearing the selected debt; the keeper clamps to the live debt.
    repayRequest,
    seize,
    fee,
    profitUsd: divDown(profitValue, USD_SCALE),
    returnRate: divDown(profitValue, repayValue)
  }
}
