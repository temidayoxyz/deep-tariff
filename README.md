# deep-tariff

Free [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin for the official DeepSeek API peak / off-peak table.

It shows, in the user's language and time zone:

```
Off-peak · 12m 4s until peak · peak soon · Flash $0.15 / $0.6 · this chat $0.041 · $12.40 left
```

Peak hours are **always UTC** (`01:00–04:00` and `06:00–10:00`, **Monday–Friday**). Weekends and every other hour are off-peak, at half price. The chip converts those windows into the browser's IANA zone, so Beijing, New York, and London each see local clocks. Copy ships in English and Chinese. It hides on every provider that is not `deepseek-official`.

The same schedule runs in Node (`ctx.deepTariff`) and in the browser chip, so a desktop shell that embeds the Web UI (Tauri, etc.) does not need a second clock.

## Install

```sh
pnpm add github:temidayoxyz/deep-tariff
```

Or clone this repo and `pnpm add file:../deep-tariff`.

Then mount both halves. `--patch` is enough for one process:

```sh
dsh web --patch path/to/node_modules/deep-tariff/examples/cordis.patch.yml
```

Or add the rows to your profile `cordis.patch.yml`:

```yaml
- insert:
    - id: deep-tariff
      name: deep-tariff
    - id: ui-deep-tariff
      name: deep-tariff/client
```

Declare `deep-tariff` in the resolver manifest's `dependencies` (Harness `verify-cordis-config` requires it).

Do not mount this package alongside another plugin that already registers `ctx.deepTariff` (for example `@deepseek-ai/dsh-deep-tariff`) — the service name would collide.

## What you get

| Export | Role |
|---|---|
| `deep-tariff` | Host service `ctx.deepTariff.resolve({ now, timeZone, provider, model })` |
| `deep-tariff/schedule` | Isomorphic UTC table + local-clock projection (no Cordis) |
| `deep-tariff/client` | Composer-dock chip: countdown, session spend, remaining credit, `{zh,en}` copy |

`resolve` returns `null` when the selected route is not on the table. The chip then renders nothing.

The chip also shows, when the host can provide them:

- **this chat $…** — estimated USD for this session. Each model call is priced at the peak/off-peak card that was in force when that call ran (not the window currently on screen). Durable fold is the `deepTariffSpend` session projection; a live `llm/stream` total is the fallback.
- **$… left** — remaining DeepSeek API credit from official `GET /user/balance` (host-side, using the existing `DEEPSEEK_API_KEY`). Omitted when the key is missing or the request fails. This is remaining credit, not lifetime spend.
- **peak soon** — when the next window is peak and less than 15 minutes away.

`priceUsage(buckets, rates)` converts billed tokens to USD. Session spend is an estimate from provider-reported tokens × the published table, not DeepSeek’s invoice.

Rates and windows are `Config` with the official 2026-09-10 defaults. Override them in cordis.yml when DeepSeek republishes prices.

Canonical Flash id is `deepseek-flash` (DeepSeek-V4.1-Flash). Retired ids `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` still resolve to the Flash card. V4 Pro (`deepseek-v4-pro`) continues at the August 16 Pro rates.

## Official table (per 1M tokens, USD)

Peak is 01:00–04:00 and 06:00–10:00 **UTC, Monday–Friday**. Off-peak is half (including all weekend hours).

| | Flash cache hit / miss / out | Pro cache hit / miss / out |
|---|---|---|
| Off-peak | $0.003 / $0.15 / $0.60 | $0.022 / $0.66 / $1.98 |
| Peak | $0.006 / $0.30 / $1.20 | $0.044 / $1.32 / $3.96 |

## License

MIT. Free for anyone to install into their own harness.
