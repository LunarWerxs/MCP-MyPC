# Is MCP-MyPC safe?

MCP-MyPC gives an AI real hands on a real computer, so here is plainly who can use it, what passes through whose hands, and how to see and stop it. The short version is in the [README](README.md#-is-it-safe).

## Who can use this computer

| Who | How they get in | Only while |
| --- | --- | --- |
| **You, through your own AI app** (the Claude desktop app, Claude Code, Codex) | The app runs MCP-MyPC right here on this computer | You are chatting. The Claude apps ask you before each step unless you turn that off |
| **Anyone who has your family code** | From their own computer, usually by asking their AI | This computer is in the family, switched on and signed in |
| **Anyone who has the ChatGPT link of this computer, or of any family computer** | ChatGPT, or anything else that can send a request to that web address. A family computer's link reaches this one through the family | That link is on. Each stays off until someone runs `mypc chatgpt on` on that computer (anyone with the family code can do that from afar) |

**Nobody else,** unless they get a copy of the code or a link: not the relay, and not the people who make MCP-MyPC (a ChatGPT link that is or was on anywhere in the family is the exception, below). Everyone in the table gets the same tools, with the same rights as the user account MCP-MyPC was installed under (on a computer with several accounts, it answers only while that account is signed in). MCP-MyPC never asks for administrator rights, but if that account can act as administrator without a prompt (for example passwordless sudo), so can they.

## Worth knowing

- 🔑 **Anyone with the family code can use every family computer**, screen included, and the computer being used does not ask its owner before each action. Give the code only to people you would trust at your unlocked computer.
- 🙋 **Your AI is told to ask first.** It explains in plain words and asks before deleting files, uninstalling programs, changing settings or anything else hard to undo. That is an instruction to the AI, not a lock on the computer, so guard the family code like a house key.
- 🔐 **The relay can't read or fake family messages.** The relay passes messages between family computers; the shared one is run by LunarWerx Studios. Every family message is end-to-end encrypted with a key made from your family code, and the code is made on your computer and never sent to the relay. The relay sees only a scrambled room id, how many connections the room has and when (so when each computer is switched on and signed in), which connection sent each message, when it was sent and how big it is, and, like any server, the internet address each computer connects from. A changed, faked or replayed message is thrown away.
- ⚠️ **The ChatGPT link is the exception** (below). It is off unless someone turns it on, and a link on at any one family computer reaches every family computer.
- 📤 **What an AI reads goes to that AI's company** as part of the chat (a screenshot, a file, a command's output), the same as if it had been pasted in. When a family member's AI reads from your computer, it goes to their AI company, in their chat history.
- 💬 **The family code appears in your AI chat** when your AI runs the family commands, so a copy of the key to every family computer goes to that AI company and stays in that chat's history. To keep it out, run `mypc family create` and `mypc family join <code>` yourself in a terminal.

## The ChatGPT link

ChatGPT only connects to tools at a public web address, so `mypc chatgpt on` gives a computer a private link on the relay. **The link works like a password, and it is the one path that is not end-to-end encrypted.** Anyone who has it can use that computer and, through it, the family's. ChatGPT's HTTPS connection ends at the relay, so whoever runs the relay (and Cloudflare, whose servers it runs on) could in principle see that traffic and use the link themselves, including reading the family code from that computer's settings. `mypc chatgpt off` kills the link within about 5 seconds. If it may have got out, change the family code too (below). Claude and Codex never use the link. If this matters to you, keep every link in the family off, or [run your own relay](docs/GUIDE.md#run-your-own-relay), which takes LunarWerx Studios, though not Cloudflare, out of that path.

## See it, and stop it

| To | Do this |
| --- | --- |
| See what others did on this computer | Ask your AI to *"show the remote activity"*, or open `~/.mcp-mypc/remote-activity.log`. Each line has the time, who asked (a family computer's name, or "ChatGPT link" for this computer's own link), the tool, and for most tools what it was for: the command, file or web address. A request made through another family computer's ChatGPT link is logged here under that computer's name, not as the ChatGPT link |
| Cut this computer off from the family | `mypc family leave`. The others can no longer reach it within about 5 seconds |
| Lock out someone who has the code | On every family computer, run `mypc family leave` and `mypc chatgpt off` (anyone with the code could have turned a ChatGPT link on there). Then one computer runs `mypc family create`, and each computer that should stay runs `mypc family join <new code>`. This ends their access through the old code. It does not undo anything they already did on those computers. With the code they could run any command there, including changing MCP-MyPC's own files or adding a program that starts at sign-in. If they might have, then on each computer, before creating or joining the new family: run `mypc uninstall --purge`, delete the `MCP-MyPC` folder in the home folder, and install again with the [install message](README.md#-install) |
| Kill the ChatGPT link | `mypc chatgpt off`. The old link stops working for good; `mypc chatgpt on` later makes a new one. If the link got out, change the family code too (the row above): whoever had it could have read the code from this computer's settings |
| Remove it completely | `mypc uninstall --purge` (details in the [guide](docs/GUIDE.md#faq)) |
| Stop it right now, without typing anything | Switch the computer off, or sign out |

The log names each caller by the name its computer gave itself, and anyone holding the code could pick any name: one more reason the code is the thing to guard. They can also run commands here, so they could edit or empty the log, and each line keeps only the first 200 characters of a command. The log is a record of honest use, not proof. What your own AI does on your own computer is not in this log; your chat shows it.

Nothing updates by itself: new code arrives only when someone runs `mypc update`, and it is whatever is in this public repository at that moment.

## The details a careful reader will want

- **The family code** is 160 random bits, written in Crockford base32 (no I, L, O or U to misread), made on the computer that ran `family create`. HKDF-SHA256 turns it into two separate values: the AES-256-GCM key, and the room id the relay sees. The code itself is never sent.
- **Every message** gets a fresh random nonce, a timestamp and a random id. One more than 10 minutes off, or already seen, is dropped, so family computers' clocks have to agree within 10 minutes. Ids of tool calls already run are kept on disk (`~/.mcp-mypc/ran-calls.json`), so a replayed call is refused even after a restart.
- **The relay** is one Cloudflare Worker with two Durable Objects: family rooms, which forward each sealed message to the room's other connections and keep no copy, and ChatGPT links, each named by a SHA-256 hash of its link so the link itself is not stored.
- **The helper** runs as the signed-in person, starts at sign-in, reconnects by itself, and re-reads its settings every 5 seconds, so `family join`, `family leave` and `chatgpt off` apply without a restart. For `mypc status`, it answers status questions (never tool calls) on `127.0.0.1:17394`, which only this computer can reach.

## Reporting a security problem

Please report it privately through GitHub's [private vulnerability reporting](https://github.com/LunarWerxs/MCP-MyPC/security/advisories/new) rather than a public issue.
