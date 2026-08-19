# deep-tariff

Free [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin for the official DeepSeek API peak / off-peak table.

It shows, in the user's language and time zone:

```
Off-peak · 2h 14m until peak · Flash $0.22 / $0.66 · 12.2K in · 1.1K out · $0.0412
```

Peak hours are **always UTC** (`01:00–04:00` and `06:00–10:00`). Off-peak is everything else, at half price. The chip converts those windows into the browser's IANA zone, so Beijing, New York, and London each see local clocks. Copy ships in English and Chinese. It hides on every provider that is not `deepseek-official`.

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

If your tree already ships `@deepseek-ai/dsh-deep-tariff` (XYZ-OS does), do not mount this package as well — you would register `ctx.deepTariff` twice.

## What you get

| Export | Role |
|---|---|
| `deep-tariff` | Host service `ctx.deepTariff.resolve({ now, timeZone, provider, model })` |
| `deep-tariff/schedule` | Isomorphic UTC table + local-clock projection (no Cordis) |
| `deep-tariff/client` | Composer-dock chip: countdown both ways, `{zh,en}` copy |

`resolve` returns `null` when the selected route is not on the table. The chip then renders nothing.

`priceUsage(buckets, rates)` converts billed tokens to USD. A harness that mounts session projections can price each request at the UTC window it ran in (XYZ-OS does this as `deepTariffSpend`); the chip then shows this session's tokens and spend. Without that projection the line still shows the live window, countdown, and per-1M rates.

Rates and windows are `Config` with the official 2026-08-16 defaults. Override them in cordis.yml when DeepSeek republishes prices.

## Official table (per 1M tokens, USD)

Peak is 01:00–04:00 and 06:00–10:00 **UTC**. Off-peak is half.

| | Flash cache hit / miss / out | Pro cache hit / miss / out |
|---|---|---|
| Off-peak | $0.007 / $0.22 / $0.66 | $0.022 / $0.66 / $1.98 |
| Peak | $0.014 / $0.44 / $1.32 | $0.044 / $1.32 / $3.96 |

## License

MIT. Free for anyone to install into their own harness.
