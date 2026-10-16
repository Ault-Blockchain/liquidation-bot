# Ault liquidation bot

The bot loads a complete indexed candidate snapshot, checks the liquidator's debt-token balances, estimates the best debt/collateral pair per borrower, ranks profitable opportunities, and broadcasts up to `MAX_SUBMISSIONS_PER_SCAN` liquidations (default 1, maximum 20) per indexed snapshot. It uses `ault-sdk-ts` to query balances and sign and broadcast directly; no `aultd` binary or simulation is required.

## Run

```sh
pnpm install
cp .env.example .env
# Set API_URL and POOL_ID in .env for your environment.
pnpm dev
```

`loadConfig` reads environment variables; `dev` and `start` load `.env` when present. The bot polls continuously in dry-run mode by default. `KEY_FILE` is required to identify the liquidator and query its balances even in dry-run; no transaction is sent unless `LIVE=true`. The file must contain a 32-byte hex private key. `MIN_PROFIT_USD` is a decimal USD amount. Optional settings: `CHAIN_ID`, `RPC_URL`, `REST_URL`, `INTERVAL_MS`, `MAX_SUBMISSIONS_PER_SCAN`.

For a compiled run, use `pnpm build && pnpm start`. Keep `.env` and the key file out of Git.

The ranking uses oracle-denominated proceeds, not realized swap proceeds. It accounts for available debt-token balances but not slippage, execution costs, or competing liquidators. An incomplete or stale candidate snapshot fails closed; risk settings refresh hourly, and oracle prices refresh on each new snapshot.

When a plan repays all debt shown in the indexed snapshot, the bot requests 1% more (rounded up) to cover interest accrued after indexing. It only plans that trade if the liquidator has enough debt tokens for the buffered request. Lending clamps the request to live debt. The displayed repayment and profit are estimates from the snapshot.

Broadcasts are sequential so one signer uses consecutive account sequences; they do not wait for block inclusion. The bot polls transaction results on later ticks and suppresses pending borrowers and reserves their requested repay amounts until confirmation. The configured submission limit is per indexed snapshot height, not a guarantee about the block in which transactions land. If a broadcast fails or its outcome is uncertain, the process stops; check transaction and account state before restarting. Pending state is in memory, so restart only after outstanding transactions have settled.
