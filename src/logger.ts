import { formatBroadcast, formatConfirmation, formatScan, type ScanView } from './display.js'

type Fields = Record<string, unknown>
type LogLevel = 'info' | 'warn' | 'error'

function jsonSafe(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Error)
    return { name: value.name, message: value.message, stack: value.stack }
  return value
}

export function createLogger(context: Fields = {}) {
  const emit = (level: LogLevel, event: string, fields: Fields = {}) => {
    process.stderr.write(
      `${JSON.stringify(
        { time: new Date().toISOString(), level, event, ...context, ...fields },
        jsonSafe
      )}\n`
    )
  }

  // Terminal views stay readable; redirected output gets the same event as a JSON line.
  const present = (event: string, fields: Fields, view: () => string) => {
    if (process.stdout.isTTY) process.stdout.write(`${view()}\n`)
    else emit('info', event, fields)
  }

  return {
    info: (event: string, fields?: Fields) => emit('info', event, fields),
    warn: (event: string, fields?: Fields) => emit('warn', event, fields),
    error: (event: string, fields?: Fields) => emit('error', event, fields),
    scan(view: ScanView) {
      present(
        'scan.completed',
        {
          height: view.height,
          candidates: view.candidates.length,
          profitable: view.ranked.length,
          selected: view.selected.size,
          maxSubmissions: view.maxSubmissions,
          live: view.live
        },
        () => formatScan(view)
      )
    },
    broadcast(hash: string, borrower: string) {
      present('liquidation.broadcast', { hash, borrower }, () => formatBroadcast(hash, borrower))
    },
    confirmed(hash: string, borrower: string) {
      present('liquidation.confirmed', { hash, borrower }, () => formatConfirmation(hash, borrower))
    }
  }
}

export type Logger = ReturnType<typeof createLogger>
