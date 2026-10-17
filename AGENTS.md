# AGENTS.md

Instructions for any coding agent working in this folder (Cursor, Codex, Gemini CLI, Windsurf,
Aider and others). Claude Code reads `CLAUDE.md` instead; both files say the same thing.

**Start here:** read `CLAUDE.md` in full. It holds the user's details, the always-rules, the
reel loop and the map of this folder. Then read `rules/TASTE.md`. Those two files are the brain.

## Skills without Claude Code

Claude Code loads the files in `.claude/skills/` automatically. Your agent may not, so load them
yourself: when the user's request matches a row below, open that `SKILL.md` and follow it step by
step, exactly as written, before doing anything else.

| The user asks for | Read and follow |
|---|---|
| a topic, what to post, news in their niche | `.claude/skills/topic-radar/SKILL.md` |
| a script, a hook, a caption, post copy | `.claude/skills/reel-script/SKILL.md` |
| a board, a build, notes applied, a render | `.claude/skills/reel-build/SKILL.md` |
| a breakdown of a reference video | `.claude/skills/video-breakdown/SKILL.md` |
| any reaction to real work, "remember this" | `.claude/skills/taste-learn/SKILL.md` |

## Ground rules (the same as CLAUDE.md, repeated so they are never missed)

1. Never invent a number. Every number needs a source the user can open.
2. Board before build: a still board and the user's notes come before any build.
3. Ask before anything outward-facing: posting, publishing, emailing, pushing.
4. Edit ravyn project files (`studio/projects/<id>.json`), never the compiled HTML.
5. Run commands from `studio/` when a skill says so (the tools use paths relative to it).
6. Long-running servers (`node ravyn/server.mjs`) run in the background.
