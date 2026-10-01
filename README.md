<div align="center">

<img src="assets/hero.svg" alt="MCP-MyPC: let your AI use your computer, and your family's. Mom's PC and Brother's laptop are joined through a small relay cloud with a padlock, and sealed messages glide between them along dotted links." width="880" />

# MCP-MyPC

**Ask your AI to fix your computer, or your mom's, from anywhere.**

A free MCP server that lets Claude, Codex or ChatGPT use your computer, and your family's, with nothing to set up on your router. Your AI installs it for you.

[![CI](https://github.com/LunarWerxs/MCP-MyPC/actions/workflows/ci.yml/badge.svg)](https://github.com/LunarWerxs/MCP-MyPC/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-2ea44f)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org)
![Windows | macOS | Linux](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0078D6)
[![MCP server](https://img.shields.io/badge/MCP-server-6E56CF)](https://modelcontextprotocol.io)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-2ea44f)
[![Discord](https://img.shields.io/badge/Discord-join_the_community-5865F2?logo=discord&logoColor=white)](https://discord.gg/PsWpeNUzhk)

[**🚀 Install**](#-install) · [🔒 Is it safe?](#-is-it-safe) · [📖 Full guide](docs/GUIDE.md) · [❓ FAQ](#-faq)

<br/>

<img src="assets/terminal.svg" alt="A terminal replays real mypc output: mypc family create prints a made-up example family code and warns to keep it private, then mypc status shows the computer, its family and the ChatGPT link." width="760" />

</div>

## TL;DR

- 🗣️ **Install by asking.** Paste one message into your AI and it sets itself up.
- 🖐️ **Your AI looks instead of guessing.** It finds files, runs commands, sees the screen and drives a browser window you can watch.
- 👪 **Help the family from anywhere.** Pair computers once with a private code. No VPN, no port forwarding.
- 🔒 **Private.** Family messages are end-to-end encrypted, and the relay in the middle can't read or fake them.
- 🆓 **Free and open source (MIT).**

## 💬 Things you can ask

| | |
| :-- | :-- |
| 🐢 **A slow computer** | *"My computer has been really slow all week. Can you figure out why?"* |
| 📄 **A lost file** | *"Find the PDF I downloaded yesterday and open it for me."* |
| 👀 **An error on Mom's screen** | *"Take a screenshot of Mom's PC and tell me what that error says."* |
| 🌐 **A website for Dad** | *"Open the library website on Dad's computer so he can see it."* |

## 🚀 Install

1. Open an AI that can run commands on your computer: the **Code** tab in the Claude desktop app, **Claude Code**, or **Codex**.
2. Paste this, with your own name for the computer:

   ```text
   Install MCP-MyPC from https://github.com/LunarWerxs/MCP-MyPC on this computer. Follow its INSTALL.md. Call this computer "Mom's PC".
   ```

3. When it's done, quit the Claude app completely and open it again. Using ChatGPT? [Turn on its link](docs/GUIDE.md#chatgpt) (Plus or Pro).

## 👪 Pair the family

1. On one computer, ask your AI to *"start an MCP-MyPC family"*. You get a code that starts with `MYPC-`.
2. Text it privately to the other person.
3. They install it too, then ask their AI to *"join my MCP-MyPC family with code ..."*.

That's it. Now ask *"what's on Mom's screen?"* and it works whenever her computer is on and she's signed in.

## 🔒 Is it safe?

- 🔑 **The family code is the key.** Anyone who has it can use every computer in the family, so share it only with people you'd trust at your unlocked computer.
- 🔐 **The relay can't read a thing.** Family messages are sealed with your code, and the relay never gets the code.
- 🙋 **Your AI is told to ask first** before deleting, uninstalling or changing settings.
- 🧾 **Everything is logged.** What another computer does on yours is written to a log on yours.
- ⚠️ **The ChatGPT link is the exception.** It's off unless someone in the family turns it on, works like a password, and isn't end-to-end encrypted.

The full picture, and how to lock someone out: [SECURITY.md](SECURITY.md).

## 🧰 What your AI can do

| | |
| :-- | :-- |
| 🔍 Find, read and save files | 🖥️ Run commands |
| 📸 Take a screenshot | 🌐 Use its own browser window |
| 🩺 Check memory, disks and system info | 📂 Open a website, file or folder |
| 👪 See which family computers are on | 🧾 Show what others did here |

Every tool works on this computer or on a family computer by name: "mom" finds "Mom's PC". [All the details](docs/GUIDE.md#tools).

## 🧩 How it works

<div align="center">
<img src="assets/how-it-works.svg" alt="How MCP-MyPC works. On Mom's PC, the AI app talks to mypc on the same computer. mypc and the background helper on Brother's PC each hold an encrypted connection to the family room on the relay, which only passes sealed messages. Separately, ChatGPT reaches a computer over HTTPS through its ChatGPT link on the relay, which is not end-to-end encrypted." width="880" />
</div>

Each computer keeps one encrypted connection to a small relay, so family computers find each other without any network setup. [More](docs/GUIDE.md#how-it-works) · [Run your own relay](docs/GUIDE.md#run-your-own-relay)

## ❓ FAQ

**Can the people who make this get into my computer?** Not without your family code, which is made on your computer and never sent to us. The one exception is a [ChatGPT link](SECURITY.md#the-chatgpt-link), if anyone in the family turns one on.

**What does it cost?** Nothing. ChatGPT needs a Plus or Pro plan for it.

**What if the other computer is off?** Your AI tells you within about 8 seconds. It's reachable whenever it's on and signed in.

**How do I remove it?** Ask your AI to *"uninstall MCP-MyPC"*.

More answers in the [full guide](docs/GUIDE.md#faq).

## 📄 License

[MIT](LICENSE) © 2026 LunarWerx Studios. Made by **[LunarWerx Studios](https://lunarwerx.com)** · 💬 [Discord](https://discord.gg/PsWpeNUzhk) · ⭐ [Star it](https://github.com/LunarWerxs/MCP-MyPC) if it helped your family.
