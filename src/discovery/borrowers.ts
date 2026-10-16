import { z } from 'zod'
import { CANDIDATE_PAGE_SIZE } from '../constants.js'
import { dec } from '../market.js'
import type { Api } from '../state/client.js'

// API integers arrive as decimal strings; keep them exact for sizing.
const uint = z.string().regex(/^\d+$/).transform(BigInt)
const denom = z.string().min(1)

const candidateSchema = z.object({
  poolId: uint,
  owner: z.string().min(1),
  borrows: z.array(z.object({ denom, assets: uint })),
  collaterals: z.array(z.object({ denom, amount: uint })),
  healthFactor: dec,
  borrowedValue: dec,
  liquidationCollateralValue: dec
})

const pageSchema = z.object({
  candidates: z.array(candidateSchema),
  indexedHeight: z.number().int().positive(),
  stale: z.boolean(),
  complete: z.boolean()
})

export type BorrowerCandidate = z.infer<typeof candidateSchema>
export type CandidateSnapshot = {
  height: number
  candidates: BorrowerCandidate[]
}

export async function discoverCandidates(api: Api, poolId: bigint): Promise<CandidateSnapshot> {
  // Read every page from one complete, consistent indexed snapshot.
  const candidates: BorrowerCandidate[] = []
  const cursors = new Set<string>()
  let cursor = ''
  let height = 0

  do {
    const query = new URLSearchParams({
      pool_id: poolId.toString(),
      limit: CANDIDATE_PAGE_SIZE.toString()
    })
    if (cursor) query.set('cursor', cursor)

    const result = await api.get(`/api/v1/lending/liquidation-candidates?${query}`, pageSchema)
    const page = result.data

    // Incomplete or mixed-height pages could omit or mis-rank borrowers.
    if (page.stale || !page.complete)
      throw new Error(`candidate snapshot unavailable at height ${page.indexedHeight}`)
    if (height && height !== page.indexedHeight)
      throw new Error('snapshot changed during pagination')
    if (page.candidates.some(candidate => candidate.poolId !== poolId))
      throw new Error('snapshot contains another pool')

    height = page.indexedHeight
    candidates.push(...page.candidates)
    cursor = result.cursor ?? ''
    if (cursor && cursors.has(cursor)) throw new Error('pagination cursor repeated')
    if (cursor) cursors.add(cursor)
  } while (cursor)

  return { height, candidates }
}
