# Installing MCP-MyPC: the recipe for your AI

*People don't need to read this page. It is the exact recipe your AI follows when you paste the
install message from the [README](README.md).*

Follow these steps in order. Explain each one to the person in plain words; they may not be technical. **Do not run anything as administrator yourself, and do not show the family code to anyone the person has not named.**

1. **Node.js 22 or newer.** Run `node --version`. If it is missing or older than v22:
   - Windows: first tell the person that Windows will ask whether to allow changes, and that they should click **Yes** (it is Node.js's own installer, and the only such prompt in this install).
     Then run `winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements`.
     For the rest of this session, use `& "C:\Program Files\nodejs\node.exe"` in PowerShell, or `"/c/Program Files/nodejs/node.exe"` in Git Bash, wherever these steps say `node`.
     The new PATH only reaches programs started after the AI app restarts.
   - macOS: ask the person to install the LTS package from https://nodejs.org, and wait until they have.
     (Do not use `brew install node`: the install records Homebrew's versioned Node path, which the next
     `brew upgrade` deletes, and MCP-MyPC then stops starting until it is installed again.)
   - Linux: if the distribution's `nodejs` package is 22 or newer, ask the person to install it themselves (it needs their password for `sudo`).
     Otherwise ask them to install Node.js 22 or newer by following https://nodejs.org/en/download, and wait until they have.
2. **Get the code** into the home folder. There is nothing to build and no `npm install`.
   - With git: `git clone https://github.com/LunarWerxs/MCP-MyPC "$HOME/MCP-MyPC"` (on macOS only if `xcode-select -p` succeeds; otherwise use the curl line below, because the Mac's built-in `git` would ask the person to install Apple's developer tools)
   - Without git, on Windows (PowerShell):
     `Invoke-WebRequest https://github.com/LunarWerxs/MCP-MyPC/archive/refs/heads/main.zip -OutFile "$env:TEMP\mypc.zip"; Expand-Archive "$env:TEMP\mypc.zip" $HOME -Force; Rename-Item "$HOME\MCP-MyPC-main" MCP-MyPC`
   - Without git, on macOS or Linux:
     `curl -L https://github.com/LunarWerxs/MCP-MyPC/archive/refs/heads/main.tar.gz | tar -xz -C "$HOME" && mv "$HOME/MCP-MyPC-main" "$HOME/MCP-MyPC"`
   - Already there from an earlier install (`$HOME/MCP-MyPC` exists)? Run `node "$HOME/MCP-MyPC/bin/mypc.mjs" update` instead, then carry on with step 3.
3. **Install:** `node "$HOME/MCP-MyPC/bin/mypc.mjs" install --name "<the name the person chose>"`.
   This adds MCP-MyPC to the Claude desktop app (on Windows and macOS even before the app is installed, so it works once it is), and to Claude Code and Codex if they are present, adds
   the `mypc` command, and starts a small background helper that also starts at every sign-in, so
   family computers and ChatGPT can reach this one. It needs no administrator rights.
4. **Tell the person** what the install printed, in two or three short sentences. The usual next step
   is to quit the Claude desktop app completely (Windows: right-click the Claude icon next to the clock > Quit;
   Mac: Claude menu > Quit Claude) and open it again.
5. **Family** (skip this if they only want their own computer):
   - They have a code from another family member: `node "$HOME/MCP-MyPC/bin/mypc.mjs" family join <code>`
   - They are the first: `node "$HOME/MCP-MyPC/bin/mypc.mjs" family create`, then tell them to send
     the code privately (a text message is fine) to the family member who should join.
6. **ChatGPT** (only if they use ChatGPT itself, not Codex): `node "$HOME/MCP-MyPC/bin/mypc.mjs" chatgpt on`,
   then walk them through the three steps it prints. ChatGPT needs a Plus or Pro plan for this. Tell
   them the link works like a password.

Use the full `node "$HOME/MCP-MyPC/bin/mypc.mjs"` form throughout. The short `mypc` command only works in terminals opened after the install.
