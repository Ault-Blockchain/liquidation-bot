import { D, type Dec } from '../market.js'

// Match the chain's distinct rounding steps instead of using JS number math.
const down = (value: Dec) => value.toDecimalPlaces(18, D.ROUND_DOWN)
export const mul = (a: Dec, b: Dec) => a.mul(b).toDecimalPlaces(18, D.ROUND_HALF_UP)
export const mulDown = (a: Dec, b: Dec) => down(a.mul(b))
export const divDown = (a: Dec, b: Dec) => down(a.div(b))
export const divUp = (a: Dec, b: Dec) => a.div(b).toDecimalPlaces(18, D.ROUND_UP)
export const units = (value: bigint) => new D(value.toString())
export const floor = (value: Dec) => BigInt(value.toDecimalPlaces(0, D.ROUND_DOWN).toFixed(0))
export const ceil = (value: Dec) => BigInt(value.toDecimalPlaces(0, D.ROUND_CEIL).toFixed(0))
export const min = (...values: bigint[]) => values.reduce((a, b) => (a < b ? a : b))
