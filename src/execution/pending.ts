import { z } from 'zod'
import { API_TIMEOUT_MS } from '../constants.js'
import type { Logger } from '../logger.js'
import type { Opportunity } from '../market.js'

const txSchema = z.object({
  tx_response: z.object({
    code: z.number().int(),
    height: z.coerce.number().int().positive(),
    raw_log: z.string().optional()
  })
})

async function getTransaction(restUrl: string, hash: string) {
  const response = await fetch(`${restUrl}/cosmos/tx/v1beta1/txs/${hash}`, {
    signal: AbortSignal.timeout(API_TIMEOUT_MS)
  })

  if (response.status === 404) return
  if (!response.ok) throw new Error(`transaction lookup ${hash}: HTTP ${response.status}`)

  return txSchema.parse(await response.json()).tx_response
}

type Entry = {
  borrower: string
  hash: string
  repayDenom: string
  repayRequest: bigint
  settledHeight?: number
}

export function createPendingTransactions(restUrl: string) {
  const entries = new Map<string, Entry>()

  return {
    has: (borrower: string) => entries.has(borrower),
    add(opportunity: Opportunity, hash: string) {
      entries.set(opportunity.borrower, {
        borrower: opportunity.borrower,
        hash,
        repayDenom: opportunity.repayDenom,
        repayRequest: opportunity.repayRequest
      })
    },
    reserved(): ReadonlyMap<string, bigint> {
      const amounts = new Map<string, bigint>()
      for (const entry of entries.values()) {
        if (entry.settledHeight !== undefined) continue
        amounts.set(entry.repayDenom, (amounts.get(entry.repayDenom) ?? 0n) + entry.repayRequest)
      }

      return amounts
    },
    async reconcile(indexedHeight: number, logger: Logger): Promise<void> {
      await Promise.all(
        [...entries.values()].map(async entry => {
          if (entry.settledHeight !== undefined) return

          const tx = await getTransaction(restUrl, entry.hash)
          if (!tx) return

          entry.settledHeight = tx.height
          if (tx.code === 0) logger.confirmed(entry.hash, entry.borrower)
          else
            logger.warn('liquidation.rejected', {
              hash: entry.hash,
              borrower: entry.borrower,
              code: tx.code,
              detail: tx.raw_log
            })
        })
      )

      // Keep settled borrowers suppressed until the candidate index has applied their tx block.
      for (const [borrower, entry] of entries) {
        if (entry.settledHeight !== undefined && indexedHeight >= entry.settledHeight) {
          entries.delete(borrower)
        }
      }
    }
  }
}

export type PendingTransactions = ReturnType<typeof createPendingTransactions>
