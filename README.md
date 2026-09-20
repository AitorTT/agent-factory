# agent-factory

A zero-dependency, buildless web dashboard that visualizes [OpenCode](https://opencode.ai)
agent sessions in real time — one animated scene per session, in seven different themes.

It reads OpenCode's event log straight out of `opencode.db`, so it follows your agents
no matter which server drives them: the desktop app, a TUI, or `opencode serve`.

```
┌─ HERMES FACTORY / stats / theme switcher ─┐   ┌────────────────────────────────┐
├───────────────────────────────────────────┤   │ ● session title · state · tool │
│ SESSIONS                                  │   │             [AUTO][▤][ on ]     │
│ ▎AGENT-FACTORY  bash · …        ● now     │   │                                │
│  CARVER         RECOVERY        ● 3m      │   │      HERO — the focused        │
│  Uploading…     fun2brush       ● 8m      │   │      session, rendered large   │
└───────────────────────────────────────────┘   └────────────────────────────────┘
```

The most recently active session is shown at the front by default. Click any row in the
stack to bring that session to the front.

## Requirements

- **Node.js 22.5+** — the default data source uses the built-in `node:sqlite` module.
  (`--source sse` works on older versions.)
- OpenCode, with at least one session that has run on this machine.
- No `npm install`. There are no dependencies.

## Quick start

```bash
node server.mjs                 # http://127.0.0.1:5100
```

Or try it with fake agents, no OpenCode required:

```bash
node server.mjs --demo
```

Then open <http://localhost:5100/>.

## Where the data comes from

| Source | How | Use when |
|---|---|---|
| `db` *(default)* | Tails the `event` table in `~/.local/share/opencode/opencode.db`, polling every 500 ms | Always. Works with any OpenCode client, needs no ports or auth |
| `sse` | Subscribes to `GET /global/event` on an OpenCode server (`--host`) | You want explicit `session.status` / `permission.updated` events |
| `--demo` | Synthetic sessions generated in-process | Trying themes without running an agent |

`db` mode reconstructs state from the `message` and `part` tables, so a session parked
on a long-running tool stays "working" instead of drifting off to the break room. It
falls back to `sse` automatically if `node:sqlite` or the database is unavailable.

## Themes

Switch with the buttons in the HUD, the `T` key, or `?theme=<id>` in the URL.

| id | theme | what you see |
|---|---|---|
| `factory` | **FACTORY** | Isometric factory floor. Each tool is a zone with its own building; the worker walks between them. Idle → break room (floating `z`s, ceiling fan) |
| `space` | **SPACE** | Single top-down panel per session: a ship flying between planets and orbiting them |
| `solar` | **SOLAR** | 3D solar system (three.js). Sun is base, one planet per tool, shader-animated surfaces. Ship flies out, orbits, returns |
| `islands` | **ISLANDS** | 3D archipelago with a wave-shader ocean. Harbour is base, one island per tool. A little boat sails out and docks |
| `rats` | **RATS** | Procedurally generated labyrinth. A rat pathfinds to the chamber for the current tool and returns to the nest when idle |
| `soldiers` | **SOLDIERS** | Side view. A squad of two knights and two archers marches a procedural landscape, fighting slimes as the agent works |
| `aoe` | **AOE** | Isometric village. Villagers build the building for whichever tool is active; the settlement persists as a record of the work |

Every theme maps the same states onto the scene, using the same colour code:
green `working`, amber `waiting`, red `error`, grey `idle`.

### Tool → destination

| Tool | Place (factory / solar / islands / rats / aoe) |
|---|---|
| `read`, `glob`, `grep`, `list`, `codesearch`, `lsp` | Archive / Library |
| `edit`, `write`, `patch` | Workbench / Forge / Workshop |
| `bash`, `shell` | Machine shop / Foundry / Mill |
| `webfetch`, `websearch` | Loading dock / Market |
| `task` | Intake / Gateway |
| `todowrite`, `todoread` | Supervisor / Command / Keep |
| errors and retries | Repair / Barracks |
| idle | Break room / Base / Nest / Harbour / Encampment |

## Using it

- **Click a row** in the session stack to bring that session to the front.
- **`AUTO` / `PINNED`** chip in the hero header — `PINNED` means you chose a session;
  click it to return to auto-following the most recently active one.
- **Toggle switch** on a row hides/shows that session across the whole dashboard.
  Choices persist in `localStorage`.
- **Folder icon** opens that session's project directory in your file manager.
  This runs on the machine hosting the server.
- **Keys**: `F` fullscreen, `T` cycle themes. Mouse wheel zooms the isometric themes.

## Phone and TV

To reach it from another device on your network, bind to all interfaces:

```bash
node server.mjs --bind 0.0.0.0
```

Then open `http://<your-pc-ip>:5100` and allow inbound TCP 5100 in Windows Firewall
(Administrator PowerShell):

```powershell
New-NetFirewallRule -DisplayName "agent-factory 5100" `
  -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5100 `
  -RemoteAddress LocalSubnet -Profile Any
```

If a session UI toggles the display, the layout adapts: on narrow screens the hero moves
below the session stack.

For a TV, `kiosk.cmd` launches Edge (falling back to Chrome) fullscreen at the dashboard.

> Security: binding to `0.0.0.0` exposes the dashboard — including
> `POST /api/open-folder` — to your LAN. The default `127.0.0.1` keeps it local.

## Configuration

Flags:

| Flag | Default | Description |
|---|---|---|
| `--port` | `5100` | Dashboard port |
| `--bind` | `127.0.0.1` | Bind address (`0.0.0.0` for LAN) |
| `--source` | `db` | `db` or `sse` |
| `--db` | `~/.local/share/opencode/opencode.db` | Path to the OpenCode database |
| `--host` | `http://127.0.0.1:4096` | OpenCode server, for `--source sse` |
| `--demo` | off | Synthetic agents |

Environment variables (flags win): `PORT`, `BIND`, `SOURCE`, `OPENCODE_DB`,
`OPENCODE_HOST`, `ACTIVE_MINUTES` (15), `RECENT_COUNT` (5), `MAX_WORKERS` (80),
`DB_POLL_MS` (500), `IDLE_GRACE_MS` (5000), `STALE_SECONDS` (180).

Sessions that are active, or updated within `ACTIVE_MINUTES`, are tracked; the newest
`RECENT_COUNT` are always kept so you can toggle between them. Idle sessions fade out
after that window.

## Architecture

```
server.mjs            relay: opencode.db (or SSE) -> worker model -> browser SSE
public/index.html     two layered canvases: #gl (WebGL, behind) and #c (2D UI)
public/app.js         state, SSE, hero + session stack layout, HUD, input, FACTORY theme
public/space.js       2D SPACE theme
public/scene3d.js     three.js host (one WebGL context) with the SOLAR and ISLANDS scenes
public/maze.js        RATS theme
public/soldiers.js    SOLDIERS theme
public/aoe.js         AOE theme
public/vendor/        vendored three.js r180 (see THIRD-PARTY.md)
kiosk.cmd             TV launcher
```

The relay keeps one small record per session — zone, state, current tool, tokens, cost —
and pushes a snapshot to browsers over `GET /api/events` (SSE, throttled to 10/s).
`GET /api/state` returns the same snapshot as JSON for debugging. Themes are pure
renderers over that model; adding one is a `xxxUpdate` / `xxxDraw` pair plus an entry in
`THEMES` in `app.js`.

## Notes and limitations

- In `db` mode there are no `permission.updated` events, so permission bubbles don't
  appear. "Idle" is inferred from the assistant message being marked complete (with a
  5 s grace period to absorb multi-step turns), not from an explicit status event.
- Activity filtering means the dashboard shows recent work, not your entire history.
- The 3D themes need WebGL; without it they show a "3D unavailable" notice and the other
  themes still work.

## License

MIT — see [LICENSE](LICENSE). Bundles three.js under its own MIT license, documented in
[THIRD-PARTY.md](THIRD-PARTY.md).
