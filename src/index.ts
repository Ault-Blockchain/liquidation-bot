import { loadConfig } from './config.js'
import { createPendingTransactions } from './execution/pending.js'
import { createWallet } from './execution/submit.js'
import { createLogger } from './logger.js'
import { createRunner } from './runner/runner.js'
import { runTick, SubmissionError } from './runner/tick.js'
import { createApi } from './state/client.js'
import { createMarketSource } from './state/market-data.js'

async function main(): Promise<void> {
  // Wire discovery, market data, ranking and optional transaction submission.
  const config = loadConfig()
  const logger = createLogger({
    bot: 'ault-liquidation',
    poolId: config.poolId.toString()
  })
  const api = createApi(config.apiUrl)
  const loadMarket = createMarketSource(api, config.poolId)
  const wallet = await createWallet(config)
  const pendingTransactions = createPendingTransactions(wallet.restUrl)

  const runner = createRunner({
    tick: previousHeight =>
      runTick({
        api,
        loadMarket,
        balances: wallet.balances,
        pendingTransactions,
        config,
        previousHeight,
        submit: config.live ? wallet.submit : undefined,
        logger
      }),
    intervalMs: config.intervalMs,
    onError: error => logger.error('tick.failed', { error })
  })

  // Stop polling and let any in-flight tick finish before disposing the SDK.
  const shutdown = () => {
    void runner.stop()
  }

  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)

  try {
    await runner.start()
  } finally {
    await runner.stop()
    wallet.close()
    process.off('SIGINT', shutdown)
    process.off('SIGTERM', shutdown)
  }
}

main().catch((error: unknown) => {
  createLogger().error('bot.failed', {
    error: error instanceof SubmissionError ? error.message : error
  })
  process.exitCode = 1
})
