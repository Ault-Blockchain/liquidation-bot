import type { z } from 'zod'
import { API_TIMEOUT_MS } from '../constants.js'
import { assetSchema, oracleSchema, paramsSchema, poolSchema } from '../market.js'

const ROOT = '/api/v1/lending'

export function createApi(baseUrl: string, request: typeof fetch = fetch) {
  async function get<S extends z.ZodType>(path: string, schema: S) {
    const response = await request(new URL(path, baseUrl), {
      signal: AbortSignal.timeout(API_TIMEOUT_MS)
    })
    if (!response.ok) throw new Error(`GET ${path}: HTTP ${response.status}`)

    // Reject malformed API data before planning a liquidation.
    return {
      data: schema.parse(await response.json()) as z.output<S>,
      cursor: response.headers.get('X-Next-Cursor')
    }
  }

  return {
    get,
    async pool(poolId: bigint) {
      return (await get(`${ROOT}/pools/${poolId}`, poolSchema)).data
    },
    async params() {
      return (await get(`${ROOT}/params`, paramsSchema)).data
    },
    async asset(poolId: bigint, denom: string) {
      return (await get(`${ROOT}/pools/${poolId}/assets/${encodeURIComponent(denom)}`, assetSchema))
        .data
    },
    async price(poolId: bigint, denom: string) {
      return (
        await get(
          `${ROOT}/pools/${poolId}/assets/${encodeURIComponent(denom)}/oracle`,
          oracleSchema
        )
      ).data.price
    }
  }
}

export type Api = ReturnType<typeof createApi>
