# Chrome Web Store listing

Copy for the Chrome Web Store developer dashboard. Not part of the extension build.

## Name

CapChecker

## Summary (132 characters max)

Stamps hype and scam posts on X with a CAP score and the reasons behind it. AI checks run on your own Darkwoods key.

## Category

Social & Communication

## Description

Fake trading wins. "My AI built an app while I slept." Undisclosed referral links dressed up as success stories. CapChecker spots them while you scroll X and stamps them CAP, with the reasons one click away.

How it works
• Pattern check, free and on your device: every post is scored for the usual tells, like "$218 → $3,406 in 72 hours", referral links, viral hype openers and guaranteed returns.
• Quick AI check, about 0.05 credits: suspicious posts get a score and specific reasons from a fast model.
• Deep check, about 5–15 credits, when you ask: a stronger model researches the post with web search. Does the tool exist, can it do what's claimed, is the link a referral programme, do the numbers agree?

Two scores
Cap: how likely the claims are misleading. 75–100 CAP · 45–74 CAP? · 20–44 Unclear · 0–19 No cap
Bait: how much the post is built to farm follows, bookmarks and replies. 60+ gets a yellow BAIT stamp when it outweighs the cap score.

A red CAP stamp only ever comes from an AI check, never from pattern rules alone. It is an automated opinion and can be wrong; press "Not cap" or "Not bait" to hide any stamp.

Your key, your costs
AI checks run on your own Darkwoods account and are paid from your credits. CapChecker stops at a daily cap you set, because Darkwoods keys have no spending limit of their own.

Referral disclosure
The extension's "Get Darkwoods" links are referral links. If you sign up through them, the developer (500altcoins) earns from what you spend on Darkwoods. The links are only opened when you click them.

Privacy
No CapChecker server, no analytics. Your key stays on your device. Post text is sent to Darkwoods only when an AI check runs.

Open source: https://github.com/500bitcoins/capchecker

## Single purpose

Flags misleading hype and engagement-bait posts on X with a score and reasons.

## Permission justifications

- **storage**: saves settings, the user's Darkwoods API key, saved results and daily usage on the device.
- **Host permission api.darkwoods.ai**: sends AI check requests to Darkwoods with the user's own key.
- **Host permission api.fxtwitter.com**: for deep checks, reads public author details and full X Article text. Can be turned off.
- **Content script on x.com and twitter.com**: reads posts on the page and draws the stamps.

## Remote code

No. All code ships in the package.

## Data usage disclosures

- Website content: yes. Post text is sent to Darkwoods when an AI check runs.
- Authentication information: yes. The user's Darkwoods API key is stored locally and sent only to Darkwoods.
- Not sold to third parties, not used for unrelated purposes, not used for creditworthiness.

## Assets

All in `store/`, made from the real extension running on a fictional timeline (no real accounts):

- `screenshot-1.png` … `screenshot-5.png`: 1280×800 screenshots, in listing order.
- `promo-tile.png`: 440×280 small promo tile.
- `marquee.png`: 1400×560 marquee (only used if the store features the extension).
- Privacy policy URL: https://github.com/500bitcoins/capchecker/blob/main/PRIVACY.md
- Still needed: a one-time $5 Chrome Web Store developer registration.
