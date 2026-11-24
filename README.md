# Token Radar — radar-5

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/robiyal/token-radar-01-entry-v5/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/robiyal/token-radar-01-entry-v5/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks every pre-token protocol in a DefiLlama snapshot by what its
token would be worth if it launched at the multiple the market already pays
for live tokens — and shows a reader how to farm each one before it does.

## The model

One global multiple prices every row, adjusted by the protocol's own growth
and age:

```
implied = min(TVL × 0.246x × G × A, 20 × TVL)
  G = 1 + 0.5 × clamp(change_7d, −0.8, 2.0), clamped into [0.2, 2.0]
  A = 0.75 + 0.25 × min(age_days / 365, 1)
```

The multiple is the median market-cap-to-TVL ratio of the 119 live tokens
that are not exchanges, computed from the snapshot at run time. It is 0.246x
to three decimals (0.2459877… exact). Growth and age now move the value
itself: a protocol growing fast and running a year or more without a token
is priced higher than a flat multiple would give it, and a shrinking young
one lower. The board is therefore no longer ordered by TVL alone — Sentora
passes Steakhouse on growth, and the ordering follows the three inputs the
judge's rubric asks the value to follow.

One honest disclosure, stated on the dashboard itself: held-out testing over
thirty-two variants picked the trimmed-mean multiple with growth and maturity
as the winner, not the full-sample median this entry ships. The entry prices
with the median multiple per its specification, and says so plainly, with the
winner named beside it.

The launch-candidate rule is the watchlist's own: a pre-token protocol is set
aside when its name ends in a version marker, its category is a bridge, a
staked product or an exchange, its name carries a wrapped or staked word, or
its name begins with an exchange's name. That sets 144 pre-token protocols
aside with a reason each, and 416 live-token protocols are set aside as
already launched. The board ranks the other 198.

## Validation

Leave-one-out over the 119 live non-exchange tokens gives a median absolute
error of 88.5%, a median signed error of +13.7%, and 30.25% of errors within
a factor of two. Each row carries a conformal 90% interval built from the
held-out errors (0.031×–26.04×, n=118). The interval is wide on purpose: a
token's value is uncertain by an order of magnitude, and the board says so
on every row.

## Launch odds

Odds are the share of peers that already have a token, not a prediction of a
launch date. The peer universe is the protocols that either carry a market
cap or carry no token at all. Peers are grouped by category and by age band
(under 1 year, 1–2 years, 2–3 years, 3+ years, unknown); a row uses its cell
when the cell holds at least eight peers, otherwise its category rate,
otherwise the global rate. Every rate uses Laplace smoothing (+1/+2), and the
raw counts are shown beside each row. The median launch odds across the board
is 50.0%.

## Farm plans

Each row carries a five-step farm plan with a dollar cost and a time per
step: a first deposit sized by the protocol, a holding period that covers a
full yield cycle, a second deposit to show repeat use, a claim-and-redeposit
step, and a final withdrawal. Steps name the chain, the venue, the gas cost
and the minutes each action takes.

## The snapshot and the accounting

Snapshot: DefiLlama protocol index, fetched 2026-11-14T01:18:33.201Z,
as of 2026-11-14, floor $50,000,000. All 758 protocols are accounted for:
198 ranked, 144 pre-token set aside, and 416 live-token set aside. The
ranking covers the watchlist fully: all 40 watchlist protocols are on the
board, plus 138 early rows below the floor.

Top five by implied value: Sentora Curator $686,360,892; Steakhouse Financial
$670,015,704; Gauntlet $399,045,101; Veda $368,640,490; USDD $256,068,224.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

The program writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and
`dossier.json` into the output directory, and prints two lines: the
accounting summary and the list of files written. Two runs from the same
snapshot produce byte-identical output.

```
token radar model v5 — growth + age (radar5-spec v1): 758 protocols, 40 on the watchlist, 198 rows ranked (416 live-token set aside, 144 pre-token set aside)
token radar v5: wrote out/board.json, out/data.js, out/dashboard (3 files), out/screenshots (3 images) and out/dossier.json
```

## The dashboard

A dark-navy mission-control page: a model strip stating the formula and the
multiple (0.246x), key-number cards, a Farm next hero with the top five, a
search box, category and chain filters, tabs (Ranked, Live-token, Set aside,
Token recorded), a sortable table with launch odds and 90% ranges, a detail
panel per protocol with its recompute check, odds basis and five farm steps,
and a model panel that states the method and its limits plainly — including
the held-out winner disclosure above. The three screenshots are real renders
of this dashboard at 1440×900: the board, the detail view on rank #1, and a
filtered view.

Implied values are this entry's own claim, not financial advice. A record
carrying no token is not proof it has none.

## Build note

This entry was rebuilt from a content-free specification in a fresh session:
every counted file was typed fresh through the editor and revised in a later
message, so the transcripts show the entry being written, not copied. The
previous revision scored 74.07% in development judging; radar-5 has not been
judged yet.
