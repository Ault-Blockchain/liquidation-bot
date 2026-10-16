import type { Config } from '../config.js'
import { type BorrowerCandidate, discoverCandidates } from '../discovery/borrowers.js'
import type { PendingTransactions } from '../execution/pending.js'
import type { Balances, Submit } from '../execution/submit.js'
import type { Logger } from '../logger.js'
import type { Market, Opportunity } from '../market.js'
import type { Api } from '../state/client.js'
import { rank } from './rank.js'

export class SubmissionError extends Error {
  constructor(cause: unknown) {
    const tx = cause as {
      confirmed?: boolean
      code?: number
      txHash?: string
      rawLog?: string
    } | null
    const rejected = tx?.confirmed === true && typeof tx.code === 'number' && tx.code !== 0
    super(
      rejected
        ? `liquidation rejected on-chain (code ${tx.code}, tx ${tx.txHash}): ${tx.rawLog}`
        : 'submission outcome is uncertain; stopping to avoid a duplicate',
      { cause }
    )
  }
}

export async function runTick(deps: {
  api: Api
  loadMarket: (candidates: BorrowerCandidate[]) => Promise<Market>
  balances: Balances
  pendingTransactions: PendingTransactions
  config: Config
  previousHeight: number
  submit?: Submit
  logger: Logger
}): Promise<number> {
  const { api, loadMarket, balances, pendingTransactions, config, previousHeight, submit, logger } =
    deps

  const snapshot = await discoverCandidates(api, config.poolId)
  await pendingTransactions.reconcile(snapshot.height, logger)

  if (snapshot.height <= previousHeight) return previousHeight

  if (snapshot.candidates.length === 0) {
    logger.scan({
      height: snapshot.height,
      candidates: [],
      ranked: [],
      maxSubmissions: config.maxSubmissionsPerScan,
      live: config.live,
      selected: new Set(),
      pending: new Set()
    })
    return snapshot.height
  }

  // Refresh prices and rank one trade per borrower.
  const market = await loadMarket(snapshot.candidates)
  const denoms = [
    ...new Set(snapshot.candidates.flatMap(candidate => candidate.borrows.map(b => b.denom)))
  ]

  const balance = await balances(denoms)
  const reserved = pendingTransactions.reserved()
  const budget = new Map(
    denoms.map(denom => [denom, (balance.get(denom) ?? 0n) - (reserved.get(denom) ?? 0n)])
  )

  const ranked = rank(snapshot.candidates, market, budget, config.minProfitUsd)
  const pendingBorrowers = new Set(
    snapshot.candidates
      .filter(candidate => pendingTransactions.has(candidate.owner))
      .map(candidate => candidate.owner)
  )

  const selected: Opportunity[] = []
  const remaining = new Map(budget)
  for (const opportunity of ranked) {
    if (selected.length >= config.maxSubmissionsPerScan) break
    if (pendingTransactions.has(opportunity.borrower)) continue

    const available = remaining.get(opportunity.repayDenom) ?? 0n
    if (available < opportunity.repayRequest) continue

    selected.push(opportunity)
    remaining.set(opportunity.repayDenom, available - opportunity.repayRequest)
  }

  logger.scan({
    height: snapshot.height,
    candidates: snapshot.candidates,
    ranked,
    maxSubmissions: config.maxSubmissionsPerScan,
    live: config.live,
    selected: new Set(selected.map(opportunity => opportunity.borrower)),
    pending: pendingBorrowers
  })

  if (!config.live) return snapshot.height
  if (!submit) throw new Error('live mode has no submitter')

  for (const opportunity of selected) {
    try {
      const hash = await submit(opportunity)
      pendingTransactions.add(opportunity, hash)
      logger.broadcast(hash, opportunity.borrower)
    } catch (error) {
      throw new SubmissionError(error)
    }
  }

  return snapshot.height
}
