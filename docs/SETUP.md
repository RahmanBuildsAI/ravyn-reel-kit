# Setup (Windows)

About 20 minutes, once. You install five free things, then open this folder in Claude Code.
Already use Claude Code? Skip to **Step 6**.

Every command below goes in **PowerShell**: press the Windows key, type `powershell`, press Enter.
Paste a command, press Enter, wait until it finishes, then the next one. Close and reopen
PowerShell after the installs so it can find the new programs.

## Step 1: Node.js (runs ravyn and the tools)

```powershell
winget install OpenJS.NodeJS.LTS
```

## Step 2: ffmpeg (reads and writes video)

```powershell
winget install Gyan.FFmpeg
```

## Step 3: Python + Whisper (turns your voice into timed words)

```powershell
winget install Python.Python.3.11
```

Close and reopen PowerShell, then:

```powershell
pip install openai-whisper
```

This one is big (a few GB, it brings PyTorch). Let it run. If you have an NVIDIA graphics card,
Whisper uses it automatically and runs about 10 times faster.

## Step 4: Google Chrome

Renders use a headless Chrome. If you already have Chrome, skip this.

```powershell
winget install Google.Chrome
```

## Step 5: Claude Code

```powershell
irm https://claude.ai/install.ps1 | iex
```

Then run `claude` once and log in. A Claude Pro or Max plan works.

## Step 6: open the kit

1. Unzip the kit somewhere easy, for example `Documents\reel-studio`.
2. In PowerShell:
   ```powershell
   cd $HOME\Documents\reel-studio
   claude
   ```
3. Say: **"Read CLAUDE.md and help me fill in the About me section."** Claude asks you a few
   questions and fills it in with you. Do this first: it is what makes the scripts sound like you.

## Step 7: check everything works

Ask Claude: **"Run the setup check."** Or double-click **`Render example.bat`** in the kit folder.
Or run it yourself:

```powershell
node --version          # v18 or newer
ffmpeg -version         # any version
python --version        # 3.10 or newer
python -c "import whisper; print('whisper ok')"
cd studio
npm test                # ravyn's tests: every line should say passed
node assets/example/build.mjs                  # builds the example reel in ravyn
node ravyn/cli.mjs render example-kit-tour      # renders it (a minute or two)
```

If `renders/example-kit-tour-v1.mp4` plays and matches `docs/example-reel.mp4`, everything works.
Then double-click **`Open ravyn.bat`** in the kit folder (or run `node ravyn/server.mjs` and go to
http://localhost:3140), and pick `example-kit-tour` to see how the reel is built. Close the
ravyn window, or press Ctrl+C in it, to stop it.

## Your first reel

Ask Claude: **"Make my first reel. Walk me through it."** It runs the whole loop with you: a
topic, a script, what to record, the board, the build, your review in ravyn, the render.

## Something broke?

| You see | Fix |
|---|---|
| `'node' is not recognized` | close and reopen PowerShell; if it still fails, reinstall Step 1 |
| `'ffmpeg' is not recognized` | close and reopen PowerShell; then `winget install Gyan.FFmpeg` again |
| `No module named 'whisper'` | `pip install openai-whisper`, then reopen PowerShell |
| A render stops halfway | render with `--workers 2`; close other heavy apps |
| ravyn says the port is in use | it is already running in another window, or use `node ravyn/server.mjs 3141` |

Still stuck? See `docs/SUPPORT.md`.
