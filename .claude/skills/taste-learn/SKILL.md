---
name: taste-learn
description: Turn the user's feedback into a rule so it never has to be said twice. Use whenever the user reacts to work they were shown, good or bad: "I don't like this", "this looks generic", "make it feel more premium", "too slow", "I love this part", "do it like this instead", "why did you do that again", or a preference you notice repeating. Also use when the user says remember this, save this rule, always do X, never do Y, or add this to my rules, and when you catch yourself about to repeat a mistake the user already flagged. Stages the rule in rules/PENDING.md and only moves it into rules/TASTE.md after the user says yes.
---

# Taste learn

The system only gets better if every reaction becomes a rule that never has to be repeated. This
skill turns a reaction into a rule, with one hard gate: **nothing is written into a permanent file
until the user confirms it.**

## Where taste lives

| State | File |
|---|---|
| Proposed, waiting for a yes | `rules/PENDING.md`, under **Open** |
| Confirmed | `rules/TASTE.md` (or the owning file below), and deleted from Open |
| Rejected | Deleted from Open, one line kept under **Rejected** so it is never re-proposed |

Owning files for a confirmed rule:

- **Default:** `rules/TASTE.md`, in the section that fits (writing, hooks, visuals, motion, sound,
  covers, captions, workflow). Create the section if it does not exist.
- **A rule about one style only:** that style's `styles/<name>/STYLE.md`.
- **A hard ban that must never be missed** (like "no em dashes"): also one line in `CLAUDE.md`.
  Only absolute laws earn a line there. Keep that file short; if it is growing, the rule belongs
  in `rules/TASTE.md` instead.

## At the start of every session

Read `rules/PENDING.md`. If anything is under Open, mention it before other work, one line per
item: the rule and where it would go. Ask for yes or no. If Open is empty, say nothing about it.

## Step 1: find the real note

A reaction is not a rule yet. Taste words are symptoms: "generic", "premium", "cheap", "basic",
"amateur", "AI-looking", "boring". The real note is the mechanism underneath, the specific thing
on screen or in the script that produced that feeling.

If the note is vague, ask only these four questions, and nothing else:

1. **What timestamp?** (or which line, which frame)
2. **What should it do instead?** Describe the movement or the change, not an adjective.
3. **What is the goal there?** What should the viewer feel or understand at that moment?
4. **Point me at one thing that got it right.** A past cut, a line, or someone else's video.

Praise counts as much as a correction, often more: it shows the target instead of just fencing off
a failure. When the user loves something, capture what exactly it was with the same care.

## Step 2: generalise it

Write the rule so it applies to work the user has not seen yet. A rule tied to one video is a
note. A rule tied to a **condition** is a system.

- Bad: "make the price number brighter."
- Good: "when text looks dull, check what is layered on top of it first, because a dark layer
  above it beats any colour change. Diagnose in order: layer above, then fill brightness, then
  glow."

Every rule has three parts:

- **Rule:** an instruction concrete enough to check.
- **Why:** the mechanism. Without it the rule gets misapplied at the edges.
- **How to apply:** the check or step that catches it next time.

## Step 3: stage it

Append to `rules/PENDING.md` under **Open**:

```markdown
### <YYYY-MM-DD> · <short title>

**Rule:** <the instruction>
**Why:** <the mechanism>
**How to apply:** <the concrete check or step>
**Trigger:** <what the user said or reacted to, in a few words>
**Proposed home:** <file and section it would move into>
**Also update:** <a checklist, template, or CLAUDE.md line, if any>
```

Then tell the user in one short block, near the top of your reply, not buried at the end:

> Staged a rule: <rule>. Why: <why>. It would go in <home>. Keep it?

## Step 4: promote on a yes

When the user confirms:

1. Write the rule into its owning file. Not into a new file.
2. If it is a hard ban, add one line to `CLAUDE.md` too.
3. If it is checkable, add it to the checklist that would catch it (for example the QA checks
   the `reel-build` skill runs before a render, or the final gates of `reel-script`).
4. **Retire whatever it replaces, by deletion** (below).
5. Delete the entry from Open in `rules/PENDING.md`.

On a no: delete it from Open and add one line under **Rejected**: the title and the reason, so it
is never proposed again.

## Retire by deletion, never by banner

When a new rule replaces an old one, **delete the old text and move the old asset.** Never add a
"superseded" or "old, do not use" banner above content that still reads like a rule.

**Why:** a banner only works on a reader who starts at the top of the file. An agent arrives by
search, in the middle of a file, and reads the old rule as current. Two rules that contradict each
other in the same set of files will both get followed, at random.

The procedure, all in the same pass:

1. **Delete the old text.** Do not annotate it.
2. **Move the old asset out of reach** (a template, a class, a sound, a preset) into a `_retired/`
   folder instead of writing that it should not be used.
3. **Search the whole kit for the old name** and repoint or delete every hit: rules, styles,
   docs, scripts, and the files in `studio/`.
4. If old projects still need the old thing, **point their references at the `_retired/` path**,
   so any new use of the normal path fails loudly.
5. Leave a stub only where other files link in. A stub holds the redirect and nothing else.

## Step 5: when the user repeats themselves

If the user has to say something twice, the first capture failed. Do not just file it again. Find
which cause it was, and fix that:

- It was never written down.
- It was written in a file nothing loads.
- It was written as a preference, not as a check.
- A checker reported it, but only the summary line was read.
- The template that produced it still produces it.

The last two are the most common. Prefer a structural fix (change the template, add the check)
over adding more text.

## Batching

At the end of a working session with several reactions, stage them all at once and show the user
one list. One confirmation pass beats interrupting them for every item.

## Never

- Never write straight into `rules/TASTE.md` or `CLAUDE.md` without a yes.
- Never keep two versions of the same rule. One rule, one home.
- Never record personal details about the user in a rule. Rules describe the work.
