# Capital Quest

## Architecture
- **Frontend**: `public/index.html` (one file: 3D CSS board, city cards, lobby). No build step.
- **Backend**: `server.js` (Node + `ws`). Server-authoritative: clients send intents (`roll`, `buy`, `build`...), the server validates, mutates state and broadcasts a per-player view. Clients never compute rent or money.
- **Database**: none yet. Rooms live in server memory, so a restart ends games. Reconnect works (token in localStorage); disconnected players are auto-played by a bot. To persist, serialise `rooms[code]` to Redis (Upstash) or Postgres after each `push(r)` and reload on boot.
- **Invitations**: players who open the site appear in "online". In a lobby, press Invite; the other player gets Join/Decline. Room codes and `?room=CODE` links also work.

## Run locally
    npm install && npm start     # http://localhost:3000   (open two tabs to test)
    node rules.test.js           # rent, double-rent, even-build, bankruptcy tests

## Deploy on Render (recommended: needs WebSockets)
1. Push this folder to a GitHub repo.
2. render.com > New > Web Service > pick the repo. Render reads `render.yaml` (build `npm install`, start `npm start`).
3. Open the `onrender.com` URL and share it. Free plan sleeps after ~15 min idle (first load is slow, live games are lost on sleep). Paid plan stays awake.

## Vercel?
Vercel serverless functions cannot hold WebSocket connections, so the game server cannot run there. Host this whole app on Render (or Railway/Fly.io). Option: static frontend on Vercel plus the server on Render, then set the `WebSocket` URL in `conn()` to your Render host.

## Rules summary
18 cities in 6 colour sets of 3. Own a full set: rent x2 and you may build up to 4 houses per city (evenly; rent x3/x6/x10/x15; cost 50% of price; sell back 50%).
# capital-quest-online
