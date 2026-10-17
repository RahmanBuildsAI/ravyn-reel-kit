---
name: topic-radar
description: Find what to make a reel about today. Searches the web for fresh news, launches and stories in the user's niche, scores every candidate with a simple rubric, and writes a dated brief of greenlit topics with sources. Use when the user says run the radar, what should I post, find me a topic, give me reel ideas, what's new in my niche, any news today, what's trending, or I don't know what to make. Writes briefs/<date>.md and hands the top picks to the reel-script skill.
---

# Topic radar

Turns "what do I post?" into a ranked list of topics that each have proof behind them. Uses Claude
Code's built-in web search (WebSearch) and page fetch (WebFetch). No scripts, no API keys.

Takes about 5 minutes. Scoring rubric: `docs/topic-scoring.md`. Load it before Step 4.

**Core principle: reach is found by evidence, not brainstorming.** A topic is greenlit only if it is
breaking now (speed) or already proved itself for someone else (validation).

## Step 1: read the niche

Open `CLAUDE.md` and find the section where the user describes their niche, audience and
platforms. Note:

- the niche (for example: AI tools, personal finance, fitness, design),
- who the audience is and where they live, if stated (this drives the local angle),
- any topics or sources the user has said to always include or always skip.

Also read `rules/TASTE.md` for topic rules. If the niche is missing or still a placeholder, ask
the user one question: "What is your niche, in one line, and who watches you?" Offer to save the
answer into `CLAUDE.md`.

## Step 2: search

Use today's date. Run 8 to 12 web searches, each a different angle on the niche. Put the month and
year in queries so results skew recent. A starting set, adapt it to the niche:

1. `<niche> news this week <month> <year>`
2. `<niche> launch announced <month> <year>`
3. `<niche> now free` and `<niche> free alternative`
4. `<biggest company in niche> announces`, one query for each of the 2 or 3 biggest names
5. `<niche> banned OR lawsuit OR shut down <month> <year>`
6. `<niche> acquires OR raises OR valuation <month> <year>`
7. `<niche> student OR teenager OR solo founder built`
8. `<niche> <audience country or city>`, when the audience is local
9. `<niche> tool tips` or `<main tool in niche> new feature`, for list ideas

Collect every result that looks like a real story: title, outlet, URL, and the publish date if
shown. Aim for 30 to 60 raw results.

## Step 3: cluster and verify

1. **Merge duplicates.** Several outlets on the same event are one story. Keep all their URLs:
   the script needs 3 or 4 independent sources later, and keeping them now saves a second search.
2. **Check the date.** If a result shows no date, open it with WebFetch and find it. Drop anything
   older than 7 days unless it is an evergreen tool list or a proven-elsewhere story.
3. **Check the facts you will score on.** Any number (price, users, money raised) must appear in a
   source you opened. If you cannot confirm it, score as if it were not there and say so.
   **Never invent a number.**
4. Keep the 8 to 15 strongest stories.

## Step 4: score

Load `docs/topic-scoring.md`. For each story:

1. Pick its lane: A tool list, B person + number, C news.
2. Score the five lane dimensions 0, 1 or 2, times 10.
3. **Saturation check.** Search `<story subject> youtube shorts`, `<story subject> reel` and
   `<story subject> tiktok`. Count creators who already posted on it this week: OPEN (0 to 2) +10,
   BUSY (3 to 5) 0, SATURATED (6 or more) -20. Never kill on saturation alone; flag that it needs
   a trend-break hook.
4. Apply the other gates: series part 2 or later -20, proven elsewhere +10 (with the link).
5. **60 or more = GREENLIGHT. Under 60 = PARK.**

Also flag, per story:

- **Local angle:** if the story touches the user's audience directly, say how. A localised version
  is often the bigger reel, and it ships as its own reel, not a caption tweak.
- **Best format:** which style in `styles/` fits (for example a facecam talk for a person story,
  a list style for tools).

What tends to break out, in order, for most niches: "stop paying, it's free now" with a big name;
a fight between big names with a clear winner and loser; proof that a job or task got automated;
a real person with a real number; a story about the viewer's own place or people.

## Step 5: the wave alarm

If a major tool, model, product or platform in the niche launched in the last 48 hours, put a loud
**WAVE ALARM** block at the top of the brief: what launched, why it matters to the audience, and
"ship inside 24 to 48 hours". That window is the whole advantage. A reel made on day 4 is a reel
on a saturated topic.

## Step 6: write the brief

Write to `briefs/<YYYY-MM-DD>.md`. If a brief for today exists, add `-2`, `-3` to the name rather
than overwriting. Format:

```markdown
# Topic radar: <YYYY-MM-DD>

Niche: <niche>. Searched: <N> queries, <N> raw results, <N> stories scored.

## WAVE ALARM (only if a launch happened)
<what, why it matters, ship by when>

## Greenlit
### 1. <story title> · <score> · lane <A/B/C>
Why: <one line, the trigger it hit>
Scores: <dimension 2, dimension 1, ...> · saturation <OPEN/BUSY/SATURATED> · gates <...>
Hook idea: <one draft hook, viewer first>
Local angle: <if any>
Format: <style>
Sources:
- <outlet>: <url> (<date>)
- <outlet>: <url> (<date>)

## Parked
- <story> · <score> · <why it fell short, what would promote it>

## Dropped
- <story>: <reason, for example too old, unverified number>
```

Rules for the brief:

- Every story keeps its source URLs. A story with no source does not appear.
- Every number in a hook idea comes from a listed source.
- Zero em dashes.
- Rank greenlit stories by score, ties broken by freshness.

## Step 7: hand it over

Reply in the chat with the greenlit list, ranked, one line each: title, score, and the reason. Then
name your single pick and why. If nothing scores 60, say so plainly and show the top 3 parked
stories with what would promote them. Do not lower the bar to fill the list.

When the user picks one, go straight to the `reel-script` skill with that story and its sources.

## Making it automatic (optional)

The user can have the radar waiting every morning with a scheduled Claude Code task (the
`/schedule` command) that runs "run the topic radar". Mention this once, the first time the radar
runs, and only set it up if the user says yes.

## Tuning

The rubric starts with equal weights. After the user has posted about 10 reels from radar briefs,
offer to compare each reel's score with its 48-hour results (shares, saves, follows) and adjust
the weights, as described in `docs/topic-scoring.md` section 5. Stage any change through
`taste-learn` first.
