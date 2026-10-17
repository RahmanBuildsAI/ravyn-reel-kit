# My reel studio

This folder is my content system: it finds topics, writes scripts, edits reels in ravyn (the
editor in `studio/ravyn/`), makes covers, and writes the post copy. Claude reads this file at the
start of every session. **Fill in every `<...>` below before your first reel.** The more honest
and specific you are here, the better every script and edit gets.

## About me

- **Name:** `<YOUR_NAME>`
- **Handle:** `<@YOUR_HANDLE>` (goes in the watermark if you turn it on)
- **What I make:** `<ONE LINE, e.g. "AI tools explained for small business owners">`
- **My niche, for the topic radar:** `<e.g. "AI coding tools, new app launches, creator tools">`
- **My audience:** `<who watches, where they are, what they care about>`
- **Platforms:** `<Instagram Reels / TikTok / YouTube Shorts / YouTube long-form>`
- **How I sound on camera:** `<e.g. "calm, friendly, short sentences, a bit of humour">`
- **My accent colour:** `<#HEX>` (used for the lit caption word, the bubble ring, the call to action)
- **My default style:** `window` (the facecam style). Change it to any folder name in `styles/`.

## Always

- **Read `rules/TASTE.md` before writing or editing anything.** It holds my taste: the rules I
  confirmed after seeing real work. It beats every default in this kit.
- **Never invent a number.** Every number in a script, caption or cover needs a source I can
  open. If a number is unknown, it does not go in.
- **Board before build.** No reel gets built until I have seen a still board (one frame per
  scene) and given my notes. A note on a still takes a minute; a note on a render takes an hour.
- **Ask before anything that goes outside this folder:** posting, emailing, publishing a link,
  pushing to GitHub. Local files and local commits are fine without asking.
- **Short, plain English** in everything I publish. Short sentences. One idea per sentence.
- `<add your own always-rules here, one line each>`

## The loop (one reel)

| Step | What happens | How |
|---|---|---|
| 1. Topic | find what is worth a reel this week | say "find me a topic" (the `topic-radar` skill) |
| 2. Script | hook tournament, beats, captions, post copy | say "write a reel about X" (`reel-script`) |
| 3. Record | film yourself saying the script, phone is fine | save it as `studio/assets/r01/facecam.mp4` |
| 4. Ingest | words, jump cuts, clean copy | in `studio/`: `node tools/ingest.mjs 1` |
| 5. Board | one still frame per scene, your notes | say "build reel 1" (`reel-build` makes the board first) |
| 6. Build | ONE build from the approved board | `reel-build` writes the cut into the ravyn project |
| 7. Review | watch it, leave notes on the frame | `node ravyn/server.mjs`, open http://localhost:3140 |
| 8. Render | a 3-second test, then the full reel | `node ravyn/cli.mjs render <id> --workers 2` |
| 9. Post | cover + caption + title | from the script file |

Any reaction I give to real work ("love this", "never do that again", "too slow") goes through the
`taste-learn` skill, so the lesson becomes a rule instead of being forgotten.

## Where things are

| Path | What |
|---|---|
| `rules/TASTE.md` | my confirmed taste rules (permanent) |
| `rules/PENDING.md` | taste patterns Claude noticed, waiting for my yes |
| `styles/` | every style, one folder each: `STYLE.md` + `preview.png` |
| `scripts/` | locked scripts, one file per reel |
| `briefs/` | topic radar briefs, one file per run |
| `docs/` | the craft: hooks, script rules, editing craft, render traps, setup |
| `studio/` | the video project: ravyn, tools, fonts, my assets, my sounds, renders |
| `.claude/skills/` | the procedures Claude follows (script, build, radar, taste, breakdown) |

## Skills

| I say | Skill |
|---|---|
| "find me a topic", "what should I post", "any news in my niche" | `topic-radar` |
| "write a reel about X", "rewrite the hook", "give me the caption" | `reel-script` |
| "build reel N", "make the board", "apply my notes", "render it" | `reel-build` |
| "break down this video", "how did they edit this", "copy this look" + a file | `video-breakdown` |
| any reaction to real work, "remember this", "save this rule" | `taste-learn` |

## Do not

- Do not copy anyone's video, footage, branding or face. A breakdown is for learning techniques.
- Do not edit the compiled HTML in `studio/variants/` by hand. Edit the ravyn project, then compile.
- Do not put my personal data, passwords or API keys in any file in this folder.
- `<add your own do-nots>`
