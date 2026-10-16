import type { BorrowerCandidate } from './discovery/borrowers.js'
import type { Opportunity } from './market.js'

type Row = { label: string; value: string }

export type ScanView = {
  height: number
  candidates: BorrowerCandidate[]
  ranked: Opportunity[]
  maxSubmissions: number
  live: boolean
  selected: ReadonlySet<string>
  pending: ReadonlySet<string>
}

function formatBox(title: string, rows: Row[]): string {
  const labelWidth = Math.max(...rows.map(row => row.label.length))
  const width = Math.max(title.length, ...rows.map(row => labelWidth + 2 + row.value.length))
  const border = `+${'-'.repeat(width + 2)}+`

  return [
    border,
    `| ${title}${' '.repeat(width - title.length)} |`,
    border,
    ...rows.map(row => {
      const prefix = `${row.label.padEnd(labelWidth)}  `
      return `| ${prefix}${row.value}${' '.repeat(width - prefix.length - row.value.length)} |`
    }),
    border
  ].join('\n')
}

export function formatConfirmation(hash: string, borrower: string): string {
  return formatBox('LIQUIDATION CONFIRMED', [
    { label: 'Tx', value: hash },
    { label: 'Borrower', value: borrower }
  ])
}

export function formatBroadcast(hash: string, borrower: string): string {
  return formatBox('LIQUIDATION BROADCAST', [
    { label: 'Tx', value: hash },
    { label: 'Borrower', value: borrower }
  ])
}

const modeRow = (live: boolean): Row => ({
  label: 'Mode',
  value: live ? 'LIVE' : 'DRY RUN'
})

export function formatScan({
  height,
  candidates,
  ranked,
  maxSubmissions,
  live,
  selected,
  pending
}: ScanView): string {
  const summary = formatBox('LIQUIDATION SCAN', [
    { label: 'Block', value: String(height) },
    { label: 'Candidates', value: `${candidates.length} total / ${ranked.length} profitable` },
    { label: 'Submissions', value: `${selected.size} planned / ${maxSubmissions} max` },
    {
      label: 'Status',
      value:
        candidates.length === 0
          ? 'No candidates'
          : ranked.length === 0
            ? 'No profitable opportunity'
            : selected.size === 0
              ? 'No available opportunity'
              : 'Ready'
    },
    modeRow(live)
  ])

  if (candidates.length === 0) return summary

  const planned = new Set(ranked.map(opportunity => opportunity.borrower))
  const skipped = candidates.filter(candidate => !planned.has(candidate.owner))
  const headers = ['#', 'Borrower', 'Repay', 'Seize', 'Profit USD', 'Return', 'Action']
  const rows = [
    ...ranked.map((opportunity, index) => [
      String(index + 1),
      opportunity.borrower,
      `${opportunity.repay} ${opportunity.repayDenom}`,
      `${opportunity.seize} ${opportunity.seizeDenom}`,
      `$${opportunity.profitUsd.toString()}`,
      `${opportunity.returnRate.mul(100).toString()}%`,
      pending.has(opportunity.borrower)
        ? 'PENDING'
        : selected.has(opportunity.borrower)
          ? live
            ? 'SEND'
            : 'DRY RUN'
          : 'WAIT'
    ]),
    ...skipped.map(candidate => ['-', candidate.owner, '-', '-', '-', '-', 'SKIP'])
  ]
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map(row => row[index].length))
  )
  const border = `+${widths.map(width => '-'.repeat(width + 2)).join('+')}+`

  const line = (values: string[]) =>
    `| ${values.map((value, index) => value.padEnd(widths[index])).join(' | ')} |`

  return [summary, border, line(headers), border, ...rows.map(line), border].join('\n')
}
