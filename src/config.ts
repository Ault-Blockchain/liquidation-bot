import { readFile } from 'node:fs/promises'
import { DEFAULT_POLL_INTERVAL_MS, MAX_LIQUIDATIONS_PER_SCAN } from './constants.js'
import { D, type Dec } from './market.js'

export type Config = {
  apiUrl: string
  poolId: bigint
  minProfitUsd: Dec
  intervalMs: number
  maxSubmissionsPerScan: number
  live: boolean
  chainId: string
  keyFile?: string
  rpcUrl?: string
  restUrl?: string
}

function booleanEnv(value: string | undefined, name: string): boolean {
  if (value === undefined || value === 'false') return false
  if (value === 'true') return true
  throw new Error(`${name} must be true or false`)
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const api = env.API_URL?.trim()
  const pool = env.POOL_ID?.trim()
  const minProfitArg = env.MIN_PROFIT_USD?.trim()

  if (!api || !pool || !minProfitArg) {
    throw new Error('API_URL, POOL_ID and MIN_PROFIT_USD are required')
  }
  if (!/^\d+$/.test(pool)) {
    throw new Error('POOL_ID must be a decimal integer')
  }

  const apiUrl = new URL(api)
  const poolId = BigInt(pool)
  const minProfitUsd = new D(minProfitArg)
  const intervalMs = Number(env.INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS)
  const maxSubmissionsPerScan = Number(env.MAX_SUBMISSIONS_PER_SCAN ?? 1)
  const live = booleanEnv(env.LIVE, 'LIVE')

  if (
    poolId <= 0n ||
    !minProfitUsd.isFinite() ||
    minProfitUsd.isNegative() ||
    !Number.isSafeInteger(intervalMs) ||
    intervalMs <= 0
  ) {
    throw new Error('invalid pool, max-repay, min-profit or interval')
  }
  if (
    !Number.isSafeInteger(maxSubmissionsPerScan) ||
    maxSubmissionsPerScan < 1 ||
    maxSubmissionsPerScan > MAX_LIQUIDATIONS_PER_SCAN
  ) {
    throw new Error(`MAX_SUBMISSIONS_PER_SCAN must be between 1 and ${MAX_LIQUIDATIONS_PER_SCAN}`)
  }

  if (!env.KEY_FILE?.trim()) {
    throw new Error('KEY_FILE is required to check liquidator balances')
  }

  return {
    apiUrl: apiUrl.toString(),
    poolId,
    minProfitUsd,
    intervalMs,
    maxSubmissionsPerScan,
    live,
    chainId: env.CHAIN_ID?.trim() || 'ault_10904-1',
    keyFile: env.KEY_FILE?.trim() || undefined,
    rpcUrl: env.RPC_URL?.trim() || undefined,
    restUrl: env.REST_URL?.trim() || undefined
  }
}

export async function readPrivateKey(path: string): Promise<string> {
  const key = (await readFile(path, 'utf8')).trim().replace(/^0x/, '')
  if (!/^[0-9a-fA-F]{64}$/.test(key))
    throw new Error('key file must contain a 32-byte hex private key')
  return `0x${key}`
}
