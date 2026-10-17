# Topic scoring

Loaded by the `topic-radar` skill. A simple rubric for deciding which topics earn a script. It is a
floor filter: it reliably separates "worth making" from "not worth it", and nothing finer. Treat it
as a starting point and tune it on the user's own results (section 5).

## 1. The core principle

**Reach is found by evidence, not brainstorming.** Every greenlit topic has proof of one of two
kinds:

- **Speed:** it is breaking inside the last 24 to 48 hours, so being early is the advantage.
- **Validation:** it already did unusually well for someone else in the niche, so demand is proven.

No posting on vibes.

## 2. Pick the lane first

Score each candidate in the one lane it belongs to, never on a mixed sheet.

| Lane | What it is | Usually wins on |
|---|---|---|
| A. Tool list | A list or how-to people keep: tools, settings, prompts, steps | Saves, both platforms |
| B. Person + number | A real person and a verified number (money, users, time) | Shares and follows |
| C. News | A launch, a ban, a deal, a fight between big names | Fast views, especially YouTube |

## 3. The rubric

Score every dimension **0** (no), **1** (partly), or **2** (fully). Multiply by 10. Five
dimensions, so each lane tops out at 100.

**Lane A: tool list**

| Dimension | 2 points when |
|---|---|
| Narrow subject | It is for active users of one specific tool or craft, not the whole niche in general |
| Save value | A reference people keep and come back to, not a story watched once |
| Actionable today | The viewer can install it or do it within 5 minutes of watching |
| Free | Everything on the list costs nothing |
| Known name | The tools are names the niche already follows |

**Lane B: person + number**

| Dimension | 2 points when |
|---|---|
| Verified number | A named person and a number with a source. **No sourced number, no lane B.** |
| Size of the number | The number stops a thumb on its own |
| Relatable | Underdog, student, solo, young, rejected, or from the user's own audience |
| Known name | A company or product people outside the niche know |
| Fresh | Inside the last 7 days (1 point if inside 30) |

**Lane C: news**

| Dimension | 2 points when |
|---|---|
| Big name | A household-name company or person |
| Strong emotion | Fear (loss of control, a ban, a leak) or awe (something that felt like science fiction) |
| Local angle | The user's own audience (country, city, profession) is part of the story |
| Fresh | Inside 48 hours (1 point for 3 to 7 days, 0 after that) |
| Actionable | Something the viewer can change or try today |

## 4. Gates (apply after the lane score)

| Gate | Effect |
|---|---|
| **Saturation** | Count creators who already posted on it this week. OPEN (0 to 2): +10. BUSY (3 to 5): 0. SATURATED (6 or more): -20. **Never an automatic kill.** A saturated topic can still win with a trend-break hook (see `docs/hooks.md`). |
| **Series part 2 or later** | -20. A part 1 is scored as a normal reel. Prefer shipping as a standalone. |
| **Proven elsewhere** | +10 if a video on this exact topic clearly beat its own channel's usual numbers in the last 30 days. Note the link. |

**Bands: 60 or more = GREENLIGHT. Under 60 = PARK.** Two bands only. Finer bands look precise and
are not.

Judgment override: a parked topic with wall-to-wall coverage or a maxed emotion score may be
promoted, with one line saying why. The rubric is a floor, not a ceiling.

## 5. Tuning it on the user's own account

The starting weights are equal on purpose. Every account is different, and the only numbers that
should move them are the user's own.

- **Judge a reel at 48 hours, never on day 0.** Early counters lag and a slow first day often
  recovers. A gate tuned on a day-0 number will throw away good topics.
- Judge on the numbers that grow an account: **shares, saves, follows per reel.** Views and watch
  time explain why. Likes and comments are context.
- After every 10 posted reels, list each reel's lane, its score, and its 48-hour results. If one
  dimension clearly separates winners from losers, give it more weight; if one is true for every
  candidate, it cannot rank anything, so drop it.
- Weights move only on results, never on a feeling. Record any change in `rules/TASTE.md` through
  `taste-learn`.
