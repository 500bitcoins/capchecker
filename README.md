# CapChecker

A Chrome extension that stamps hype and scam posts on X with a **CAP** score and the reasons behind it.

Fake trading wins, "my AI built an app overnight" threads and undisclosed referral funnels all follow the same patterns. CapChecker spots them while you scroll, runs a quick AI check on the suspicious ones, and puts a stamp on the post. Click the stamp to see why.

![CapChecker stamps on an X timeline](docs/stamps.png)

## How it works

1. **Pattern check (free, on your device).** Every post on screen is scored against rules for the usual tells: "$218 → $3,406 in 72 hours", referral links, "who the f*ck built this" openers, "0 manual work", guaranteed returns, coin-pump language, and text aimed at AI checkers. Posts above your sensitivity setting are flagged.
2. **Quick check (AI, about 0.05 credits).** When a flagged post scrolls into view, CapChecker asks a fast model (Claude Haiku 5.5 by default) for a score and reasons.
3. **Deep check (AI, about 5–15 credits, on request).** A stronger model (Claude Opus 5.5 by default) researches the post with web search: does the tool exist and can it do what's claimed, is the link a referral programme, do the numbers agree.

Every AI check gives two scores. **Cap** is how likely the post's claims are misleading. **Bait** is how much the post is built to farm follows, bookmarks and replies ("PDF below", "comment X and I'll DM you", "follow for part 2"). A post can be true and still be bait.

| Stamp | When |
|---|---|
| **CAP** (red) | Cap score 75–100. Always wins. |
| **CAP?** (orange) | Cap score 45–74, unless bait is higher |
| **BAIT** (yellow) | Bait score 60+ and higher than the cap score |
| Unclear | Cap score 20–44 |
| No cap | Cap score 0–19 |

A red CAP stamp only ever comes from an AI check. Pattern rules on their own can only mark a post as "Possible cap" or "Possible bait". Results are saved on your device for 7 days, so the same post is never paid for twice.

## Install

Until the Chrome Web Store listing is live:

1. Download or clone this repo.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the repo folder.
3. The settings page opens. Paste your Darkwoods API key and press **Save and test**.

## Darkwoods key

AI checks run on your own [Darkwoods](https://app.darkwoods.ai/r/HPMFL2363ULQ) account and are paid from your credits (100 credits = $1). No account yet? Sign up through that link, then create a key under API keys.

> The Darkwoods link above is a **referral link**: 500altcoins earns from what you spend on Darkwoods if you sign up through it.

**Darkwoods keys have no spending limit of their own.** A key can spend your whole balance. CapChecker stops at its own daily cap (50 credits by default, set in settings), but keep a small balance on the account you use, and revoke the key in Darkwoods if you stop using CapChecker.

## Measured costs

From real runs on 19 Oct 2026:

| Check | Model | Typical cost | Time |
|---|---|---|---|
| Quick | claude-haiku-5.5 | 0.05–0.06 credits | 1–4 s |
| Deep | claude-opus-5.5 + web search | 7–11 credits | ~40 s |

Web search is 0.85 credits per search, and a deep check is limited to 3 rounds of tool calls.

## Privacy

There's no CapChecker server. Your key stays on your device, and post text only leaves it when an AI check runs. See [PRIVACY.md](PRIVACY.md).

## Limits

- Desktop Chrome (and Chromium browsers) only. Extensions can't run inside the X phone apps.
- It's an automated opinion and it can be wrong. Use **Not cap** or **Not bait** to hide a stamp you disagree with. BAIT stamps can be turned off in settings.
- X changes its page structure from time to time, which can break the stamps until CapChecker is updated.

## Development

```bash
npm install
npm test
```

`npm test` runs the rule and verdict tests. `npm run test:e2e` loads the extension into Chromium against a mock X timeline. Set `DARKWOODS_API_KEY` to include real quick checks (about 0.2 credits), and `E2E_DEEP=1` to add one deep check.

To run the real checks on any post from the command line (handy when tuning the prompts):

```bash
DARKWOODS_API_KEY=dwk_... npm run check -- https://x.com/user/status/123 --deep
```

```bash
npm run zip
```

That builds `dist/capchecker-<version>.zip` for the Chrome Web Store.

## License

MIT. Made by [@500altcoins](https://x.com/500altcoins).
