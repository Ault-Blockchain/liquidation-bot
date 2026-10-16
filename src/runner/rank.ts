import type { BorrowerCandidate } from '../discovery/borrowers.js'
import type { Dec, Market, Opportunity } from '../market.js'
import { planLiquidation } from '../sizing/plan.js'

function compare(a: Opportunity, b: Opportunity): number {
  // Rank by absolute profit first, then return; remaining fields break ties.
  return (
    b.profitUsd.comparedTo(a.profitUsd) ||
    b.returnRate.comparedTo(a.returnRate) ||
    a.borrower.localeCompare(b.borrower) ||
    a.repayDenom.localeCompare(b.repayDenom) ||
    a.seizeDenom.localeCompare(b.seizeDenom)
  )
}

export function rank(
  candidates: BorrowerCandidate[],
  market: Market,
  balances: ReadonlyMap<string, bigint>,
  minProfitUsd: Dec
): Opportunity[] {
  // Try every debt/collateral pair, but keep only one trade per borrower.
  const best = new Map<string, Opportunity>()

  for (const candidate of candidates) {
    for (const debt of candidate.borrows) {
      for (const collateral of candidate.collaterals) {
        const opportunity = planLiquidation(
          candidate,
          debt,
          collateral,
          market,
          balances.get(debt.denom) ?? 0n
        )
        if (!opportunity || opportunity.profitUsd.lt(minProfitUsd)) continue

        const previous = best.get(candidate.owner)
        if (!previous || compare(opportunity, previous) < 0) best.set(candidate.owner, opportunity)
      }
    }
  }

  return [...best.values()].sort(compare)
}
