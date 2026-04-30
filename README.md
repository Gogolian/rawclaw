# rawclaw

**rawclaw** is a minimal, auditable personal AI agent that talks to the Anthropic API. It runs on a stock Node.js ≥ 20 install with no dependencies — no `npm install`, no bundler, no build step. The entire codebase is plain JavaScript using only the Node standard library. Anyone can read every file in under 15 minutes and understand exactly what the agent does with their data and API key.

## Philosophy

Most AI agent frameworks pull in hundreds of transitive packages. rawclaw refuses: `dependencies: {}` is non-negotiable. You get an agent loop, tool use, memory, a CLI REPL, and optional Telegram polling — all built from `node:https`, `node:fs`, `node:readline`, and friends. Small files, descriptive names, no magic.

## Comparison

| Feature | rawclaw | OpenClaw | NanoClaw |
|---|---|---|---|
| Runtime dependencies | **0** | many | few |
| Requires npm install | **No** | Yes | Yes |
| Plain Node.js only | **Yes** | No | No |
| Built-in tool use | Yes | Yes | Yes |
| Multi-channel | CLI + Telegram | Multiple | Limited |
| Auditable in 15 min | **Yes** | No | Maybe |

## Quickstart

```bash
git clone https://github.com/Gogolian/rawclaw.git
cd rawclaw
cp config.example.json config.json
export ANTHROPIC_API_KEY=sk-ant-...
node index.js
```

Type a message and press Enter. Use `/reset` to start a new conversation and `/exit` to quit.

## Adding a skill

Drop a `.js` file in the `skills/` directory that exports `{ name, description, input_schema, run }`. The agent loads it automatically at startup. See [`skills/README.md`](skills/README.md) for details.

## Security notes

- **Shell tool is opt-in.** Set `"tools": { "shell": { "enabled": true } }` in `config.json` to allow the agent to run shell commands. Leave it disabled (the default) if you don't need it.
- **Review skills before installing.** Skills are arbitrary JavaScript loaded at runtime. Treat them like npm packages — read the code before adding them.
- **Memory is plaintext.** Conversation history is stored in `./memory/*.json`. These files contain everything you say to the agent. Keep them out of version control (the default `.gitignore` excludes them).
- **API key lives in the environment.** Never put your key in `config.json` or commit it anywhere.

## Roadmap

- Streaming CLI output (token-by-token display)
- More channels: Discord (needs WebSocket), Slack, WhatsApp
- Encrypted memory (at-rest AES-256 via Node crypto)
- Container isolation for the shell tool

