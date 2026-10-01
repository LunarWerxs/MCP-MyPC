# MCP-MyPC: the full guide

Everything beyond the [README](../README.md): turning it on in each app, the family in detail, every tool and command, the FAQ, and how it is built. Safety has its own page: [SECURITY.md](../SECURITY.md).

- [Turn it on](#turn-it-on) · [ChatGPT](#chatgpt)
- [Family computers](#family-computers)
- [Tools](#tools)
- [Commands](#commands)
- [FAQ](#faq)
- [How it works](#how-it-works)
- [Run your own relay](#run-your-own-relay)

## Turn it on

| App | What to do |
| --- | --- |
| **Claude desktop app** | Quit it completely (Windows: right-click the Claude icon next to the clock > **Quit**; Mac: **Claude** menu > **Quit Claude**). Closing the window is not enough. Open it again and ask: *"Take a screenshot of my computer"*. Claude asks before it uses MCP-MyPC; allow it. |
| **Claude Code** | Start a new chat. It's already there. |
| **Codex** | Start a new session. The install adds MCP-MyPC to Codex's settings when Codex is on the computer. |
| **ChatGPT** | Turn on the private link below. Needs a Plus or Pro plan. |

### ChatGPT

ChatGPT can only reach tools at a public web address, so MCP-MyPC gives this computer a private link on the relay, shaped like `https://mcp-mypc-relay.lunawerx.workers.dev/link/<43 private characters>/mcp`. Ask your AI to *"turn on the MCP-MyPC ChatGPT link"* (it runs `mypc chatgpt on`). It prints your link and these three steps, for ChatGPT on the web:

1. Open **Settings** and turn on **Developer mode** (under **Apps & Connectors > Advanced**, or under **Security** in newer versions).
2. Add a new app or connector with the **Create** or **+** button. Name it **MyPC**, paste your link, choose **No authentication**, confirm you trust it, and save.
3. In a new chat, turn on **MyPC** from the **+** menu and ask: *"Take a screenshot of my computer"*.

> [!WARNING]
> **The link works like a password, and it is the one path that is not end-to-end encrypted.** Read [the ChatGPT link](../SECURITY.md#the-chatgpt-link) before you turn it on. `mypc chatgpt off` kills it within about 5 seconds. The computer has to be switched on and signed in for ChatGPT to reach it.

## Family computers

1. **On the first computer**, ask your AI to *"start an MCP-MyPC family"* (it runs `mypc family create`). You get a long code that starts with `MYPC-`.
2. **Send the code privately** to the family member who should join. A text message is fine.
3. **On their computer**, they tell their AI *"join my MCP-MyPC family with code"* followed by the code (it runs `mypc family join <code>`). No MCP-MyPC there yet? They add *"Then join my MCP-MyPC family with code ..."* to the install message.
4. **Check it worked:** run `mypc status` (or ask your AI to run it). The others show up while they are switched on and signed in. An AI app that was already open when this computer joined sees the family only after it restarts: quit and reopen the Claude desktop app, or start a new Claude Code or Codex session.

Different houses and different Wi-Fi are fine, with no network setup. The code is forgiving to type: capital letters or not, dashes or none, and an O works as a zero, an I or L as a one. If you type it with spaces, put it in quotes: `mypc family join "MYPC 7K2Q ..."`.

## Tools

These are the tools MCP-MyPC gives your AI ([src/tools/index.mjs](../src/tools/index.mjs) is the list):

| Tool | What it lets your AI do | Opens anything on that screen? |
| --- | --- | --- |
| `list_computers` | See this computer and the family computers online right now, with their systems | No |
| `run_command` | Run a command: PowerShell on Windows, the login shell on macOS and Linux. It stops after 2 minutes unless asked for longer (up to an hour; through the ChatGPT link the answer has to come back within 4 minutes), along with everything it started. It never waits for typing, and very long output is cut off | No, unless the command starts a program |
| `find_files` | Find files and folders by name, newest first, in the home folder unless told where, optionally only ones changed in the last few days. Folders of program files (like `node_modules` or `AppData`) and hidden folders are skipped | No |
| `read_file` | Read a text file, or look at a picture (png, jpg, gif, webp) up to 5 MB. Files over 20 MB are refused | No |
| `write_file` | Save text to a file, making folders as needed, or add to the end of one | No |
| `list_folder` | List a folder (the home folder unless told otherwise), folders first, up to 500 entries | No |
| `screenshot` | Take a picture of the screen: every monitor on Windows and Linux, the main display on a Mac (on Windows and macOS, shrunk to at most 1600 pixels wide) | No |
| `browser` | Work its own separate browser window (Chrome, Edge or Brave; Chromium too on a Mac or Linux), which starts signed out of everything and never uses your own browser profile: open a page, read it, click, type, go back, take a picture of it, close it. Anything signed in there stays signed in, for family members and the ChatGPT link too, so don't sign in to your own accounts in it | **Yes**, its own window |
| `computer_info` | Check the system version, processor, memory, disks, how long it has been on, and the home folder | No |
| `open` | Open a website, file or folder with its usual program, for the person at that computer | **Yes** |
| `remote_activity` | Show what family computers and the ChatGPT link did on this computer | No |

Every tool except `list_computers` also takes a `computer`: a family computer's name, or part of it. Leave it out and the tool works on this computer. A name that matches more than one computer, this one included, is refused, never guessed.

## Commands

Most people never type these: they ask their AI, and it runs them. After the install, `mypc` works in any new terminal window once its folder is on PATH: `%LOCALAPPDATA%\Microsoft\WindowsApps` on Windows (already on PATH), `~/.local/bin` on macOS and Linux (often not on a Mac; on Linux it can take one sign-out and back in). The install tells you which. Where it doesn't work, the full form always does: `node "$HOME/MCP-MyPC/bin/mypc.mjs" <command>`.

| Command | What it does |
| --- | --- |
| `mypc install [--name "Mom's PC"] [--relay <url>]` | Set up this computer. Running it again is fine; `--relay` switches to [your own relay](#run-your-own-relay) |
| `mypc status` | Is the helper running, and which family computers are online |
| `mypc family create` | Start a family and print its code |
| `mypc family join <code>` | Join a family with the code from another computer |
| `mypc family code` | Show this family's code again |
| `mypc family leave` | Stop sharing this computer with the family |
| `mypc chatgpt on` / `off` | Turn the private ChatGPT link on (and print it) or off |
| `mypc rename "<name>"` | Change the name family computers see |
| `mypc update` | Get the newest version (`git pull`, or a fresh download without git). A failed update puts the old version back |
| `mypc uninstall [--purge]` | Remove it (`--purge` also deletes its settings, family code included) |
| `mypc help` | List the commands |

Settings live in `~/.mcp-mypc`: `config.json` (this computer's name, the family code, the ChatGPT link when it is on, and the relay address if you set your own; readable only by your user account on macOS and Linux), `remote-activity.log`, `agent.log` (plus `agent-errors.log` on a Mac), `ran-calls.json`, and the separate browser's profile.

## FAQ

**Will the person at the other computer know I'm using it?**
They see anything that opens on their screen: the browser window your AI works in, or a website, file or folder it opens for them. Commands, reading and saving files, and screenshots happen without a window, and no pop-up asks them to allow a family member's request. Everything is written to the activity log on their computer. Locking the screen does not stop it; switching the computer off, putting it to sleep or signing out does.

**What if the other computer is switched off?**
Then your AI can't reach it, and says so. A family computer is reachable while it is switched on and signed in. Ask for one that has just gone off and you hear so within about 8 seconds instead of waiting. Its helper starts again by itself when the person who installed it signs back in.

**What if the relay goes down?**
Your AI keeps working on your own computer, because that never uses the relay. Reaching family computers, and the ChatGPT link, stop until it is back, and the helpers reconnect by themselves.

**How many computers can be in a family?**
A family's room on the relay takes up to 16 connections at once. Each computer's helper uses one, and each open AI chat that has reached the family uses one more.

**What does the install change on my computer?**
Three things, all for your user account only. It adds MCP-MyPC to the Claude desktop app (on Windows and Mac even if it is not installed yet) and to Claude Code and Codex if they are there, and keeps their other settings; for the Claude app it also keeps a backup, `claude_desktop_config.json.before-mypc`. It adds the `mypc` command. And it starts a small background helper now and whenever you sign in (Windows: a per-user startup entry with no window and no admin; Mac: a LaunchAgent; Linux: a systemd user service). Its settings live in the `.mcp-mypc` folder in your home folder.

**How do I remove it?**
Ask your AI to *"uninstall MCP-MyPC"*, or run `mypc uninstall --purge`. That takes it out of your AI apps, removes the `mypc` command, stops the background helper so it no longer starts at sign-in, and (because of `--purge`) deletes its settings, family code included. Then delete the `MCP-MyPC` folder in your home folder. If you added it to ChatGPT, run `mypc chatgpt off` first and remove MyPC in ChatGPT's settings. Node.js and the Claude app's `.before-mypc` backup stay. To stop sharing this computer with the family but keep using it yourself, run `mypc family leave` instead.

**How do I get updates?**
Ask your AI, or run `mypc update`, then restart your AI app. If an update fails, the old version is put back. Nothing updates by itself.

**Does it work on a Mac? On Linux?**
Yes, both, with Node.js 22 or newer. On a Mac, the first screenshot needs a one-time yes in System Settings > Privacy & Security > Screen Recording, given at that Mac: for Claude or Terminal when your own chat asks, and for `node` (the background helper) when a family computer or the ChatGPT link asks. On a Mac the folder the `mypc` command goes in (`~/.local/bin`) is often not on PATH; the install tells you, and the [full form](#commands) always works. On Linux the helper is a systemd user service; without systemd the install starts it, but it does not start by itself at login. On Linux, after a restart the helper may start before the desktop, and then screenshots, `open` and the browser do not work for family computers or the ChatGPT link until the helper is restarted (`systemctl --user restart mcp-mypc.service`). Screenshots on Linux need one of grim, gnome-screenshot, scrot or ImageMagick.

**Something broken?**
[Open an issue](https://github.com/LunarWerxs/MCP-MyPC/issues) with the output of `mypc status` and your `~/.mcp-mypc/agent.log`, or [ask in the Discord](https://discord.gg/PsWpeNUzhk).

## How it works

There are three paths:

1. **Your AI, your computer.** The Claude desktop app, Claude Code or Codex starts `mypc stdio` on this computer and talks to it over standard input and output. The call never leaves this computer.
2. **Your AI, a family computer.** `mypc stdio` seals the request with the family key and sends it over a WebSocket to the family's room on the relay. The background helper on the other computer (`mypc agent`), which keeps its own connection to that room, confirms receipt at once, writes a line to its activity log, runs the tool and sends back a sealed answer. Because receipt is confirmed at once, a computer that is off is noticed within about 8 seconds.
3. **ChatGPT.** ChatGPT sends each request over HTTPS to this computer's link on the relay. The relay hands it to this computer's helper over the helper's WebSocket and returns the answer.

The MCP side is a tools-only server speaking JSON-RPC over stdio (Claude, Codex) and over HTTP (ChatGPT, through the relay), protocol versions 2024-11-05, 2025-03-26, 2025-06-18 and 2025-11-25. The encryption details are in [SECURITY.md](../SECURITY.md#the-details-a-careful-reader-will-want).

```text
bin/mypc.mjs           the mypc command: install, family, chatgpt, status, update, uninstall,
                       plus the stdio and agent entry points
src/mcp.mjs            the MCP protocol (stdio and HTTP)
src/instructions.mjs   what the AI is told when it connects
src/tools/             one file per kind of tool; index.mjs is the list and sends a call to
                       another computer when `computer` names one; browser-page.mjs runs
                       inside the web page
src/family.mjs         family codes, encryption, asking other computers
src/relay-socket.mjs   the connection to the relay (reconnects, pings)
src/agent.mjs          the background helper
src/setup.mjs          start at sign-in, the mypc command, adding MCP-MyPC to AI apps
src/config.mjs         settings in ~/.mcp-mypc, and the default relay
src/util.mjs           shared helpers: running a shell command, paths, sizes, times
relay/                 the Cloudflare Worker (worker.js, wrangler.toml)
test/                  npm test (Node's built-in test runner)
```

No dependencies, so there is nothing to `npm install`. CI runs `npm test` on Ubuntu, Windows and macOS for every push and pull request, plus a check that the server starts and lists its tools.

## Run your own relay

The shared relay, `https://mcp-mypc-relay.lunawerx.workers.dev`, is run by LunarWerx Studios. It can't read family traffic, but you don't have to rely on it, and your own matters most if you use the [ChatGPT link](#chatgpt). The relay is one small file ([relay/worker.js](../relay/worker.js), about 130 lines) that runs on Cloudflare's free plan. With a Cloudflare account, from the MCP-MyPC folder:

```bash
cd relay
npx wrangler deploy
```

It prints your relay's address. Then, on every computer in the family:

```bash
mypc install --relay https://<your-relay>.workers.dev
```

- All computers in a family have to use the same relay.
- The address must start with `https://` (`http://localhost` is allowed for a relay you are testing on the same computer).
- If the ChatGPT link is on, run `mypc chatgpt on` again to print its new address, and paste that into ChatGPT.
- Limits built into the relay: up to 16 connections per family room at once, and each ChatGPT request at most 4 MB and 4 minutes.
