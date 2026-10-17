# Script rules

Loaded by the `reel-script` skill. The user's own rules in `rules/TASTE.md` override anything here.
When the user flags a new phrase or habit, `taste-learn` stages it, and once confirmed it is added
to the right list below (or to `rules/TASTE.md`).

## 1. Banned phrases

These read as AI-written creator filler. Never use them or close variants:

- "here's the part that stuck with me", "the part that got me"
- "because get this", "and get this", "get this"
- "here's the thing"
- "let that sink in"
- "here's what nobody's telling you"
- "the crazy part is"
- "plot twist"
- "here's the kicker"
- "buckle up"
- "little did they know"
- "the results will shock you"
- "game changer", "changes everything" (unless a sourced fact proves it)
- "in today's fast-paced world", "in the ever-evolving landscape"
- "unlock", "unleash", "supercharge", "dive in", "deep dive"
- Sentence-fragment rhetorical questions such as "The safe jobs?" They sound like the sentence
  broke. Ask a full question or state it.

Natural talk markers are **good** and make a script sound human: okay so, like, honestly, kinda,
right?, so, y'know.

**Test:** read the line aloud. If it sounds like an AI trying to write a viral hook, rewrite it in
plain words with a real person's rhythm.

## 2. No em dashes

Zero em dash characters anywhere the audience can see: voiceover, captions, on-screen text, cover,
title, description, comments. It is one of the strongest "written by AI" tells. Replace it with a
period, a comma, a colon, or a connector word (and, so, because). A hyphen inside a word
(self-hosted, one-click) is fine. Final gate before locking: search for the character, count must
be zero.

## 3. Plain English swaps

Explain it like you are telling a friend who knows nothing about the topic.

| Jargon | Plain |
|---|---|
| shorting a stock | betting it drops |
| valuation got stretched | prices got too high |
| market correction | a fall |
| open-source model | an AI anyone can download for free |
| API | a way for apps to talk to each other |
| inference cost | what it costs to run each answer |
| agent | an AI that does tasks on its own |
| latency | how long you wait |
| deprecated | being switched off |

No acronym without a plain gloss the first time it appears. Titles and captions follow the same
rule.

## 4. The but/therefore spine, in full

Every beat must connect to the next with **but** or **therefore**, never **and then**.

- **"And then" makes a list.** Nothing in beat 3 depends on beat 2, so every boundary is a clean
  exit point. A reel that is really a list of facts bleeds viewers even when every fact is good.
- **"Therefore" makes a chain.** Leaving means leaving mid-chain.
- **"But" makes a reversal.** The next beat breaks the expectation the last one set. This is the
  hook's curiosity gap applied at every beat.

Method:

1. Write the spine first, one line per beat.
2. Write the connector between every pair. If only "and then" fits, cut or reorder that beat.
3. Alternate. All therefores marches and goes flat. All buts is whiplash. Best rhythm: a run of
   therefores, broken by a but at the turn.
4. Put a **but** at the hook boundary and at the 40 to 60% mark, where attention dips.
5. End on a **therefore**, so the payoff is earned, not announced.

Spoken: "but" is natural, use it freely. "Therefore" is formal. Use the literal word at most once,
only at a mechanical turn ("you can't see which one is stuck, therefore every one gets its own
light"). Elsewhere use "so", "which means", "that's why", "so now". On a zoom-out beat (a bigger
meaning drawn from the story, not caused by it), drop the word and state the meaning as a concrete
rule: not "therefore AI is now a team", but "and you don't build a control panel for a tool. You
build one for a team."

Spine block format:

```
1. HOOK: <beat>
   BUT
2. <beat>
   THEREFORE
3. <beat>
   ...
```

## 5. Emotion toolkit

| Device | Example shape |
|---|---|
| Direct address | "You're the one who pays for this." |
| Fragment stack | "It happened again. Different company. Same problem." |
| Thinking question | "Remember when this was science fiction?" |
| Turn word | "but", "except", "and that's when it got weird" |
| Real reaction | "I had to read that twice." |
| Rhythm break | a long build, then a four-word slam |

Delivery note shape: one line, the arc. "Start curious, build to alarm on the price, land calm and
certain on the CTA, slow down on the last line."

## 6. CTA and identity line

One CTA goal per reel, rotated by reel type:

| Reel type | CTA goal | Shape |
|---|---|---|
| News, drama | Share | "Send this to the friend still paying for X." |
| Tool, how-to, list | Save | "Save this so you have it when you need it." |
| Proof with a real next part | Follow | "Follow, part two is the one that broke." |
| Resource giveaway | Comment keyword | "Comment GUIDE and I'll send you the list." |

Never "like this video". Shares, saves and follows grow an account; likes are context.

**Identity line:** one spoken line, 3 seconds or less, right before or fused with the CTA. It says
why to follow, built on the positioning in `CLAUDE.md`. Never the exact same wording two reels in a
row. Keep one anchor idea recognisable. Example bank for an AI-explainer account, rewrite for the
user's niche:

- "Follow, I break this stuff down so you're ahead of it."
- "I test these tools so you don't have to."
- "Follow for the next one in plain English."

Log which variant was used in the script file so rotation is checkable.

## 7. Post copy formats

**Instagram caption**
```
<hook line 1>
<hook line 2>

<the point in 1 or 2 plain sentences>

<CTA: comment keyword, share, or save>
Save this so you don't lose it.

#<tag> #<tag> #<tag>
```
Lowercase hashtags, 3 to 5. Short beats long.

**YouTube Shorts**
- Title: hook-formula phrasing, numbers as digits, one emoji as punctuation (🤯 default, 🛑 for
  stop-paying, 🤫 for secret), a bracket for the twist when there is one: "(It Worked)",
  "(Do This Instead)".
- Description: two lines. What it is, then the CTA. Then `#shorts`.

**LinkedIn (optional): a take, never a recap.** The post is the reel's opinion, written to be
argued with. The list itself stays in the reel. Skeleton:

1. A claim that reframes who the villain is.
2. A line that defuses the obvious attack ("and the X are not the problem").
3. One flat credential line: what you checked yourself, and when.
4. Optional: two short lists set against each other, 4 lines max each.
5. One line that names the gap.
6. A triplet: what you checked, what you found, what it cost someone.
7. A softener: who is stuck and why, without blame.
8. Direct address to one specific reader, then one instruction.
9. A closing couplet with a turn.
10. A question aimed at the exact audience, phrased so both sides answer.

Rules: one dated source, no links in the body (put them in the first comment), 3 to 5 CamelCase
hashtags on the last line, 180 to 320 words, plain English.

## 8. The script file template

Saved as `scripts/<YYYY-MM-DD>-<slug>.md`.

```markdown
# <working title>

Status: LOCKED
Runtime: <words> words at <wpm> wpm = <seconds>s
Delivery note: <one-line emotional arc>
Identity line used: <variant>

## Beat spine
<spine block>

## Hook tournament
| Option | Formula/lever | Checks passed | Notes |
| ... |
Winner: <hook>. Cover text (runner-up): <text>.

## Script
| Time | Line | Emotion | On screen |
|---|---|---|---|
| 0:00 | <hook with **spike** word> | curious | <real footage or screenshot> |

## Cover
Text: <6 words or fewer>. Image idea: <one line>.

## Shot list
- <footage, screenshot, screen recording, with where to get it>

## Post copy
### Instagram
### YouTube Shorts
### LinkedIn (optional)

## Sources
| Fact | Number | URL |
|---|---|---|
```
