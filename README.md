# TuboApp plugin

Connect your own Claude (Claude Code, Claude.ai, Claude Desktop) or OpenAI Codex to your TuboApp account. TuboApp (app.tuboapp.com) is a YouTube outlier and competitor research app with about 13M videos and 52k channels. You sign in with your TuboApp account through OAuth; no key is pasted anywhere.

MCP server URL: `https://tuboapp-mcp-production.up.railway.app/mcp`

## What is inside

| Path | What it is |
|---|---|
| `.claude-plugin/plugin.json` | Claude Code plugin manifest (name `tuboapp`, version 0.1.0) |
| `.claude-plugin/marketplace.json` | Claude Code marketplace; installs this package from the repo root |
| `plugin.json` | Portable Agent Plugins manifest for Codex (version 0.1.0) |
| `mcp.json` | Portable MCP configuration for Codex (`streamable-http`, OAuth, no headers) |
| `.agents/plugins/marketplace.json` | Codex marketplace; installs this package from the repo root |
| `.mcp.json` | Registers the remote TuboApp MCP server as an `http` server named `tuboapp`, with no headers (OAuth handles sign-in) |
| `skills/find-my-outliers/` | Finds videos that beat their channel's usual views, explains why, suggests 3 ideas |
| `skills/make-this-video-brief/` | Turns one video into a "Make this video" brief: format, ladder of winners, length, angle, 5 titles, thumbnail notes, hook |
| `skills/compare-me-to-competitors/` | Your channel vs tracked competitors: cadence, typical views, outliers, formats, 3 next moves |
| `skills/track-a-competitor/` | Adds a channel to your tracking and queues its first sync, only after you say yes |
| `validate.mjs` | Package checks (run `node plugin/validate.mjs` from the repo root) |

Try asking: "find outliers in my niche from the last 3 months", "make a brief for https://youtu.be/...", "compare me to my competitors for the last 90 days", "track @somechannel".

## Install

### Claude Code

Once the public repo exists:

1. Run `/plugin marketplace add golfersauthority/tuboapp-plugin`.
2. Run `/plugin install tuboapp@tuboapp-marketplace`.
3. Run `/mcp`, pick **tuboapp**, choose **Authenticate**, and sign in with your TuboApp account.

`claude mcp add` is not needed with the plugin. Check the connection by asking "call whoami on TuboApp".

Fallback without the plugin: run `claude mcp add --transport http tuboapp https://tuboapp-mcp-production.up.railway.app/mcp`, then `/mcp`, pick **tuboapp**, and **Authenticate**. Copy each skill folder from `skills/` into `~/.claude/skills/`.

### Codex

Once the public repo exists:

1. Run `codex plugin marketplace add golfersauthority/tuboapp-plugin`.
2. Install **tuboapp** from `/plugins`.
3. Run `codex mcp login tuboapp` and sign in with your TuboApp account.

Fallback without the plugin: run `codex mcp add tuboapp --url https://tuboapp-mcp-production.up.railway.app/mcp`, then `codex mcp login tuboapp`. Copy each skill folder from `skills/` into `~/.agents/skills/`.

### Claude.ai and Claude Desktop

1. Go to Customize, Connectors (https://claude.ai/customize/connectors), select **Add**, then **Add custom connector**.
2. Name it `TuboApp`, paste the MCP server URL above, click **Continue**. Keep the authentication settings Claude marks **Detected** (sign-in through OAuth), then click **Add** and **Connect**, and sign in with your TuboApp account.
3. Skills (optional but recommended): zip each folder in `skills/` on its own (for example `find-my-outliers.zip` containing the `find-my-outliers` folder with its `SKILL.md`). Then go to Customize, Skills (https://claude.ai/customize/skills), click **+**, **+ Create skill**, **Upload a skill**, and upload each zip. Skills need code execution turned on for your account. The skills use only the `name` and `description` frontmatter fields, which claude.ai upload accepts.

## Publishing

The new public repo root must contain the **contents of `plugin/`**, including its hidden directories. Use `git subtree split --prefix=plugin` from the application repo to prepare that history, or copy the contents into the new repo. Do not put another `plugin/` directory above them.

Bump `version` in **both** `.claude-plugin/plugin.json` and root `plugin.json` on every release, keeping them identical. Claude caches plugins by version.

Run `node plugin/validate.mjs` from the application repo root (or `node validate.mjs` from the mirrored repo root), plus `claude plugin validate ./plugin` and `claude plugin validate ./plugin --strict` (use `.` in the mirrored repo).

## What it can and cannot do

Can:
- Read the shared TuboApp library: search videos, get a video, get a channel and its videos, catalog stats.
- Read your own data: your tracked channels and groups, your sync jobs and history, your daily YouTube quota budget, your A/B tests, title and thumbnail change history for your tracked channels, your folders and bookmarks.
- Change your own data, only when you ask and only with `confirm=true`: add a tracked channel, queue a channel sync, set a channel's group, favorite a channel, set your primary channel, create or rename folders, add or move bookmarks.

Cannot:
- Delete anything (no channel, folder, bookmark or A/B test deletes). Do that in app.tuboapp.com.
- See or change another user's data. Asking for someone else's item returns "not found".
- Run TuboApp's paid AI tools (title ideas, content gap analysis) or any admin tool.

Limits per account: 15 requests a minute, one heavy query at a time, and 200 YouTube quota units a day for syncs. When a limit is hit the tools return `MCP_RATE_LIMITED` or `MCP_QUOTA_BUDGET_EXHAUSTED`, and the skills tell you plainly instead of retrying in a loop. Titles and descriptions from YouTube are treated as untrusted text, never as instructions.

## Not yet done or UNVERIFIED

- **Public repository pending.** Marketplace files exist for Claude Code and Codex, but the public repo has not been created. The friend install commands above become usable after it is published.
- **Live OAuth sign-in tested, 2026-11-21.** Claude Code and Codex sign-in were tested via `claude mcp add` / `codex mcp add`, not via plugin installation.
- **Local validation after this fix.** The descriptions now use valid quoted YAML, and the package validator checks that syntax and both marketplace layouts. The requested Claude validation commands pass after this fix; this does not verify live plugin installation.
- **Directory submission gaps.** Claude's separate directory checks report a missing license, icon, and privacy policy URL. These are non-fatal for the requested validation commands; submission to the official directory needs separate preparation.
- **UNVERIFIED: live plugin install.** Neither the Claude Code marketplace install nor the live Codex plugin install has been tested. Codex packaging follows the portable Agent Plugins format, with root `plugin.json`, `mcp.json`, and `skills/`.
- **UNVERIFIED: Claude Desktop.** The steps above come from claude.ai docs; that a connector and skills added on claude.ai show up in the Desktop app was not confirmed.
- **Primary channel.** The skills ask which tracked channel is yours when `list_channels` does not mark one; whether the per-user response includes a primary flag was not checked.

## Sources (originally opened 2026-11-20; Codex packaging rechecked 2026-11-21)

- Claude Code plugins overview: https://code.claude.com/docs/en/plugins
- Claude Code plugins reference (manifest fields, standard layout, `claude plugin validate`): https://code.claude.com/docs/en/plugins-reference
- Claude Code install plugins (`/plugin install`, `/plugin marketplace add`, `--plugin-dir`): https://code.claude.com/docs/en/plugins/install
- Claude Code create a marketplace: https://code.claude.com/docs/en/plugin-marketplaces
- Claude Code MCP (plugin-provided servers, `.mcp.json` `type: http`, `/mcp` authentication): https://code.claude.com/docs/en/mcp
- Claude Code skills (frontmatter, fields allowed for claude.ai upload): https://code.claude.com/docs/en/skills
- Claude.ai add a custom connector by URL: https://claude.com/docs/connectors/custom/add-unlisted
- Claude Help Center, use skills in Claude (zip upload, code execution): https://support.claude.com/en/articles/12512180-use-skills-in-claude
- Codex skills locations (`.agents/skills`, `$HOME/.agents/skills`): https://developers.openai.com/codex/skills (served from https://learn.chatgpt.com/docs/build-skills)
- Codex MCP (`codex mcp login`, config): https://developers.openai.com/codex/mcp (served from https://learn.chatgpt.com/docs/extend/mcp); `codex mcp add --help` on codex-cli 0.167.0-alpha.4.1 for `--url`
- OpenAI package your plugin (Codex plugin format): https://developers.openai.com/plugins/build/plugins
