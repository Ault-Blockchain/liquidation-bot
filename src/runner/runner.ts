import { SubmissionError } from './tick.js'

export function createRunner(deps: {
  tick: (previousHeight: number) => Promise<number>
  intervalMs: number
  onError: (error: unknown) => void
}) {
  let stopped = false
  let running: Promise<void> | undefined
  let wake: (() => void) | undefined

  async function run(): Promise<void> {
    let previousHeight = 0

    while (!stopped) {
      try {
        previousHeight = await deps.tick(previousHeight)
      } catch (error) {
        // An uncertain broadcast may have landed, so do not retry it blindly.
        if (error instanceof SubmissionError) throw error
        deps.onError(error)
      }

      if (stopped) return

      await new Promise<void>(resolve => {
        const timer = setTimeout(() => {
          wake = undefined
          resolve()
        }, deps.intervalMs)
        wake = () => {
          clearTimeout(timer)
          wake = undefined
          resolve()
        }
      })
    }
  }

  function start(): Promise<void> {
    if (stopped) return Promise.resolve()
    running ??= run()
    return running
  }

  function stop(): Promise<void> {
    stopped = true
    wake?.()
    return running ?? Promise.resolve()
  }

  return { start, stop }
}
