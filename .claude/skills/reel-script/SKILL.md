---
name: reel-script
description: Write a locked short-form reel script, from hook to post copy. Use when the user says write a script, make a reel about X, draft a reel, script this topic, I picked a topic, rewrite the hook, give me hook ideas, make the intro better, write my caption, or write the post copy for Instagram or YouTube. Runs the hook tournament, the but/therefore beat spine, the draft, the plain-English pass, the banned-phrases pass, the emotion pass, an adversarial critique, then packages captions and titles. Saves the locked script to scripts/<date>-<slug>.md.
---

# Reel script

Input: a topic, ideally a greenlit one from a `topic-radar` brief in `briefs/`. Output: one locked
script file the user can read aloud, record, and hand to the build.

Reference docs, load them when the stage says so:

- `docs/hooks.md`: hook formulas, the four levers, viewer first, the spike word, trend break,
  retention devices.
- `docs/script-rules.md`: the banned phrase list, the plain-English swap table, the full
  but/therefore method, the emotion toolkit, CTA and outro rules, post copy formats, the file
  template.

Also read `rules/TASTE.md` before writing. The user's own rules beat anything in this skill.

## Before you start: the facts rule

**Never invent a number.** Every number, date, price, name and claim in the script needs a source
link the user can open and check. Collect the sources first, then write.

1. If the topic came from a brief in `briefs/`, start from its source URLs.
2. Otherwise run a web search and open at least two independent sources for the core claim.
3. Write every fact you plan to use into a Sources table (fact, number, URL).
4. If a number cannot be confirmed, it does not go in. Write around it ("billions", "a lot of
   people") or drop the line. Do not round, estimate, or "remember" a figure.

## Stage 0: saturation check

Search the topic. If several creators have already posted on it in the last week, the TREND BREAK
hook (in `docs/hooks.md`) outranks any first-to-market hook, and a hook that pretends to be first
is disqualified. If the story is fresh (inside 24 to 48 hours), trend break is unavailable: the
viewer has not heard the claim yet, and speed is the advantage.

## Stage 1: the hook tournament

Load `docs/hooks.md`. Write 5 to 8 hook options:

- 2 or 3 adapted from the hook templates that fit the story (swap the blanks, keep them TRUE),
- 2 or 3 from the seven formulas,
- 1 trend break, only if the topic is saturated and you genuinely have the missing part,
- 1 shared-memory hook, if `CLAUDE.md` says the audience is mostly one country or community.

Score each option in a table, one column per check:

| Check | Pass when |
|---|---|
| Stranger stop | A stranger scrolling at 2x speed would stop, not just a friend |
| Hard noun | It contains a number, a brand name, or the word free |
| Conflict | There is a villain, a loser, or a forbidden thing |
| Short | 8 spoken words or fewer, 3 seconds or less |
| Open question | It creates a question the viewer must have answered |
| No self-answer | Line 1 does NOT answer its own question. Line 1 must force line 2 |
| Viewer first | The viewer is the subject of sentence one (skip for pure drama or warning reels) |
| Spike word | One marked word to peak on inside the first 8 seconds |
| Retention promise | On a list, countdown or giveaway reel, it names the payoff for staying |

The top one survives as the spoken hook. The runner-up becomes the cover text, which must differ
from the spoken hook: two different chances to stop the scroll. Show the user the top 3 with one
line each on why, and let the user pick if they want to.

## Stage 2: the beat spine (mandatory gate)

Write the spine **before any prose**, one line per beat, with the connector word between every
pair written out:

- **"and then"** means the story is broken. Each beat is a fresh start, and every boundary is a
  clean exit point. Cut that beat or reorder it.
- **"therefore"** means consequence. Beat 3 exists because of beat 2, so leaving means leaving
  mid-chain.
- **"but"** means reversal. Beat 3 contradicts what beat 2 set up.

Alternate them: a run of therefores building momentum, broken by a but at the turn. Put a **but**
at the hook boundary and at the 40 to 60% mark, where attention sags. End on a **therefore**, so
the payoff feels earned.

Spoken, the literal word "therefore" appears at most **once**, at a mechanical turn where beat A
physically causes beat B. Carry the same logic elsewhere with "so", "which means", "that's why".
On a zoom-out beat (a bigger meaning, not a cause), drop the word and state the meaning as a
concrete rule the viewer completes. Full method in `docs/script-rules.md`.

If any connector reads "and then", the script does not move on.

## Stage 3: draft

1. **Hook**, 3 seconds or less: the tournament winner.
2. **Stakes**, one line: why this matters to the viewer, "you".
3. **Meat**, 3 to 4 beats. Every sentence adds new information. No sentence exists twice.
4. **Identity line**, about 3 seconds: why follow this account. Rotate wording, never the same
   line two reels in a row (see `docs/script-rules.md`).
5. **CTA**, one goal per reel, rotated: share-bait for news and drama ("send this to the friend
   still paying for X"), save-bait for tools and how-tos ("save this before you need it"),
   follow-bait only when a real next episode exists. Never "like this video".

**Length: density buys length.** Aim for 45 to 60 seconds. Dead screen time is the retention risk,
not duration. Trim beats that are static or repeat a point, never to hit a number.

**Runtime is computed, not guessed:** `words / wpm * 60`. Use the user's measured pace from
`rules/TASTE.md`. If it is not there yet, use 170 wpm, and after the first recorded take measure
it with `ffprobe -v error -show_entries format=duration -of csv=p=0 <take-file>`, divide the word
count by the minutes, and offer to save the pace to `rules/TASTE.md` through `taste-learn`.

## Stage 4: plain-English pass

Rewrite every line so someone who knows nothing about the topic follows it, like telling a friend.
Kill jargon ("shorting" becomes "betting it drops", "correction" becomes "a fall"). No acronym
without a plain-word gloss the first time. Test: read it to a non-expert in your head; any word
that would make them pause gets swapped. This applies to captions and titles too.

## Stage 5: banned-phrases pass

Load the banned list from `docs/script-rules.md` and remove every hit or close variant. Natural
talk markers are good: okay so, like, honestly, kinda, right?, y'know. Formula phrases that sound
like an AI writing a viral hook are not. No sentence-fragment rhetorical questions ("The safe
jobs?"): ask a full question or state it.

**Zero em dashes.** Not in the voiceover, captions, on-screen text, cover, title, or description.
Search the file for the em dash character before locking; the count must be zero. Use a period,
comma, colon, or "and/so/because". A hyphen inside a word is fine.

Read every line aloud. If it sounds written, rewrite it as spoken.

## Stage 6: emotion pass

A writing change first, a delivery change second.

- Direct address ("you", "your") every few lines.
- Short fragments for impact: "It happened again. Different company. Same problem."
- Questions that make the viewer think.
- Turn words as gear shifts: but, except, and that's when.
- One genuine reaction line, where a real person would react.
- Vary rhythm: a long build, then a short slam.

Add an **EMOTION** column to the script table (curious, alarmed, smirking, urgent, dead serious)
and a one-line **delivery note** at the top with the emotional arc. The user performs the arc,
not the words. In scripts over 40 seconds, open small loops around 20s and 40s.

## Stage 7: adversarial critique

A second pass whose only job is to attack the draft. Write the critique out:

- Where exactly does attention drop? Mark the sentence.
- Which sentence is filler? Delete it, do not soften it.
- Is the hook's promise actually paid off by the end?
- Can every line be shown on screen with something real (footage, a screenshot, the app in use)?
  A line with nothing to show is dead screen time.
- Does every number have a source row?

Rewrite until the critique finds nothing structural. Usually 1 or 2 rounds.

## Stage 8: lock and package

Save to `scripts/<YYYY-MM-DD>-<slug>.md` using the template in `docs/script-rules.md`. Every file
contains:

1. Delivery note, beat spine, chosen hook plus the tournament table.
2. The script table: time, line (spike word in bold), EMOTION, what is on screen.
3. Cover text (the runner-up hook, 6 words or fewer) and a one-line cover image idea.
4. Shot list: every piece of footage, screenshot and screen recording the build needs.
5. **Post copy:**
   - **Instagram caption:** 2 or 3 short hook lines, the point in plain words, one CTA (a comment
     keyword if the user has a resource to send, otherwise share or save), the line "Save this so
     you don't lose it.", 3 to 5 lowercase hashtags. Short.
   - **YouTube Shorts:** a title in hook-formula phrasing, numbers as digits, one emoji as
     punctuation, a bracket for the twist when there is one ("(It Worked)"), a two-line
     description, `#shorts`.
   - Optional **LinkedIn** post, only if the user posts there: format in `docs/script-rules.md`.
6. Sources table: every fact with its URL.

Final gates before you call it locked:

- [ ] Spine has zero "and then".
- [ ] Em dash count is zero in the whole file.
- [ ] Zero banned phrases.
- [ ] Every number has a source URL.
- [ ] Runtime computed from the word count.

## After the lock

Tell the user, in plain words: the hook, the runtime, the file path, and the next step. The next
step is to record the take, then the `reel-build` skill makes a still board of the frames first.
Never jump from a script straight to a full build.

If the user reacts to the script (likes a line, hates a phrase), run `taste-learn` on it so the
note becomes a rule and never has to be said twice.
