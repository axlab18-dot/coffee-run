# SEON Battle Ball — Design Spec

Date: 2026-07-27

## Concept

A real-time multiplayer browser game. Multiple players connect simultaneously, auto-run to the right along a side-scrolling track, dodge obstacles, throw balls to hinder opponents, and race to be first to the finish line.

## 1. Lobby & Matchmaking

- On visiting the site, the player is first prompted for a nickname via a simple text input (no login/authentication).
- After entering a nickname, the player joins a single shared public lobby; currently connected players are visible in the lobby, shown by nickname.
- Each player clicks "Ready." When everyone in the lobby is ready, the race starts for all of them together.
- No room codes or invites — one shared lobby, no player-count cap.
- A round in progress does not accept new joiners; new connections wait in the lobby for the next round.

## 2. Controls

- Character auto-runs rightward continuously; players cannot control speed directly.
- **Up arrow**: Jump — clears pits and low obstacles.
- **Down arrow**: Duck — dodges incoming thrown balls.
- **Space**: Throw a held ball, aimed at the nearest opponent ahead.

## 3. Track Obstacles

| Obstacle | Effect on hit |
|---|---|
| Pit/trap | Falls in → stopped for 3 seconds |
| Rock | Collision → stopped for 2 seconds |
| Stone | Collision → slowed for 1 second |

## 4. Ball System

- Balls spawn at random points along the track; players pick them up by running over them.
- **Big ball**: hit → knocked down, stopped for 2 seconds.
- **Small ball**: hit → slowed for 1 second.
- Thrown via Space; the server resolves trajectory and hit detection against nearby opponents.

## 5. Win Condition

- Players are ranked by finish order.
- The round ends when all players finish or a time limit expires.
- A results screen is shown, then all players return to the shared lobby.

## 6. Technical Architecture

- **Server**: Node.js + Express + Socket.io. The server is authoritative — it runs the game loop (positions, obstacle/ball collision, ball-throw resolution) and broadcasts state to clients multiple times per second. State is in-memory only; no database, no persistence across restarts.
- **Client**: HTML5 Canvas + vanilla JS. Clients render server-provided state (with light interpolation for smoothness) and send only input events (jump/duck/throw) to the server.
- **Deployment**: Single Node process serving both static assets and the WebSocket connection. Runs locally; can be deployed to a single host later.

## 7. Error Handling

- **Disconnect during a race**: the player is removed from the track; the race continues for remaining players.
- **Reconnection**: not supported mid-race — a disconnected player rejoins from the lobby starting with the next round.

## Out of Scope (for this iteration)

- Persistent accounts, stats, or leaderboards.
- Private/invite-only rooms or room codes.
- Mobile touch controls.
- Reconnection to an in-progress race.
