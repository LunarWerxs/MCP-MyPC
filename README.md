# MCP-MyPC

Let your AI (Claude or ChatGPT) use your computer, and the computers of family members you pair with,
with nothing else to install. Ask things like *"why is my computer slow?"*, *"find the PDF I downloaded
yesterday"* or *"check what's on Mom's screen"*.

- **Your computer:** run commands, read and save files, take screenshots, drive a browser window,
  open websites and files.
- **Family computers:** pair computers once with a family code. After that, your AI can do all of the
  above on the others too, as long as they are switched on. No Tailscale, no port forwarding, no
  router settings.
- **Private:** family traffic is end-to-end encrypted with the family code. The relay that passes
  it along cannot read it, change it, or run anything. Only computers that have the code can.

## Install: tell your AI

Open an AI that can run commands on your computer: the **Code** tab in the Claude desktop app,
Claude Code, or Codex. Paste this:

> Install MCP-MyPC from https://github.com/LunarWerxs/MCP-MyPC on this computer. Follow the
> "For the AI doing the install" steps in its README. Call this computer "Mom's PC".

When it finishes, it tells you how to switch it on in Claude or ChatGPT. That takes about a minute.

## For the AI doing the install

Follow these steps in order. Explain each one to the person in plain words; they may not be
technical. Do not run anything as administrator, and do not show the family code to anyone the person
has not named.

1. **Node.js 22 or newer.** Run `node --version`. If it is missing or older than v22:
   - Windows: `winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements`,
     then, until a new terminal is opened, use `& "C:\Program Files\nodejs\node.exe"` (PowerShell) wherever these steps say `node`.
   - macOS: `brew install node` if Homebrew is installed. Otherwise ask the person to install the
     LTS package from https://nodejs.org, and wait until they have.
   - Linux: the distribution's `nodejs` package if it is 22 or newer, otherwise https://nodejs.org.
2. **Get the code** into the home folder. There is nothing to build and no `npm install`.
   - With git: `git clone https://github.com/LunarWerxs/MCP-MyPC "$HOME/MCP-MyPC"`
   - Without git, on Windows (PowerShell):
     `Invoke-WebRequest https://github.com/LunarWerxs/MCP-MyPC/archive/refs/heads/main.zip -OutFile "$env:TEMP\mypc.zip"; Expand-Archive "$env:TEMP\mypc.zip" $HOME -Force; Rename-Item "$HOME\MCP-MyPC-main" MCP-MyPC`
   - Without git, on macOS or Linux:
     `curl -L https://github.com/LunarWerxs/MCP-MyPC/archive/refs/heads/main.tar.gz | tar -xz -C "$HOME" && mv "$HOME/MCP-MyPC-main" "$HOME/MCP-MyPC"`
3. **Install:** `node "$HOME/MCP-MyPC/bin/mypc.mjs" install --name "<the name the person chose>"`.
   This adds MCP-MyPC to the Claude desktop app, Claude Code and Codex (whichever are present), and
   starts a small background helper that also starts at every sign-in, so family computers and
   ChatGPT can reach this one.
4. **Tell the person** what the install printed, in two or three short sentences. The usual next step
   is to quit the Claude desktop app completely and open it again.
5. **Family** (skip this if they only want their own computer):
   - They have a code from another family member: `node "$HOME/MCP-MyPC/bin/mypc.mjs" family join <code>`
   - They are the first: `node "$HOME/MCP-MyPC/bin/mypc.mjs" family create`, then tell them to send
     the code privately (a text message is fine) to the family member who should join.
6. **ChatGPT** (only if they use ChatGPT itself, not Codex): `node "$HOME/MCP-MyPC/bin/mypc.mjs" chatgpt on`,
   then walk them through the three steps it prints. ChatGPT needs a Plus or Pro plan for this.

## What the AI can do

| Tool | What it does |
| --- | --- |
| `list_computers` | This computer and the family computers online right now |
| `run_command` | Run a command (PowerShell on Windows, the normal shell on Mac and Linux) |
| `read_file`, `write_file`, `list_folder` | Read, save and browse files |
| `screenshot` | A picture of the screen |
| `browser` | A separate browser window: open, read, click, type, screenshot |
| `computer_info` | System version, memory, disk space, processor |
| `open` | Open a website, file or folder for the person at that computer |
| `remote_activity` | What family computers and the ChatGPT link did on this computer |

Every tool takes an optional `computer`: a family computer's name, or part of it ("mom" finds
"Mom's PC"). Leave it out to use this computer.

## Family computers

One computer runs `family create` and gets a code like `MYPC-7K2Q-…`. Every other computer that runs
`family join <code>` joins that family. Each computer's background helper keeps one connection open to
the relay, so family computers can reach it wherever it is, with no network setup.

- **Who can get in:** only computers holding the code. Anyone with the code can use every computer in
  the family, so share it only with the people who should have that.
- **What the relay sees:** which family a message belongs to (a hash of the code), when it was sent,
  and how big it is. Not what it says. It cannot make a family computer do anything.
- **Seeing what happened:** every action another computer takes is logged on the computer it happened
  on. Ask the AI for `remote_activity`, or open `~/.mcp-mypc/remote-activity.log`.
- **Leaving:** `mypc family leave`. To lock out someone who has the code, make a new family
  (`family leave`, then `family create`) and share the new code only with the people who should have it.

## ChatGPT

ChatGPT only connects to tools at a public web address, so `mypc chatgpt on` gives this computer a
private link on the relay. Anyone who has that link can use this computer (and, through it, the
family's), so treat it like a password. `mypc chatgpt off` kills it at once, and `chatgpt on`
afterwards makes a new one.

Unlike family traffic, the ChatGPT link is **not** end-to-end encrypted. ChatGPT talks to the
relay over normal HTTPS, so whoever runs the relay could in principle see that traffic. If that
matters, use the Claude desktop app or Codex (they run MCP-MyPC directly and never use the link), or
run your own relay.

## Everyday commands

`mypc` below means `node "$HOME/MCP-MyPC/bin/mypc.mjs"`. Or just ask the AI to do it.

| Command | |
| --- | --- |
| `mypc status` | Is the helper running, and which family computers are online |
| `mypc family create` / `join <code>` / `code` / `leave` | Family |
| `mypc chatgpt on` / `off` | The ChatGPT link |
| `mypc rename "Mom's PC"` | The name family computers see |
| `mypc update` | Get the newest version |
| `mypc uninstall [--purge]` | Remove it (`--purge` also deletes its settings) |

## Run your own relay

The relay is one small Cloudflare Worker ([relay/worker.js](relay/worker.js)) that runs on the free plan.

```bash
cd relay
npx wrangler deploy
```

Then run `mypc install --relay https://<your-worker>.workers.dev` on every computer in the family.
They all have to use the same relay.

## How it fits together

```
Claude app ──stdio── mypc stdio ──┐                          ┌── mypc agent (Mom's PC)
                                  ├── relay (encrypted room) ─┤
ChatGPT ──HTTPS── relay link ─────┘                          └── mypc agent (Brother's PC)
```

- `bin/mypc.mjs`: the command line (install, family, chatgpt, status, update, uninstall)
- `src/mcp.mjs`: the MCP protocol (stdio and HTTP)
- `src/tools/`: one file per kind of tool; `index.mjs` sends a call to another computer when `computer` names one
- `src/family.mjs`: family codes, encryption, and asking other computers
- `src/agent.mjs`: the background helper
- `src/setup.mjs`: start at sign-in, and adding MCP-MyPC to the AI apps
- `relay/`: the Cloudflare Worker

No dependencies. Tests: `npm test`.

## License

MIT
