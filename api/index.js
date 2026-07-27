const { createGameServer } = require('../server/app');

// Vercel's Node.js runtime recycles a "warm" lambda instance across
// invocations, so we memoize the game server on `global` to avoid rebuilding
// the lobby/round state and re-registering socket handlers on every request.
// NOTE: this is a best-effort adaptation. Vercel's serverless model does not
// guarantee a single persistent process or shared memory across concurrent
// instances, so the always-on game loop and in-memory lobby this game relies
// on may not stay consistent for every player under real traffic.
if (!global.__seonGameServer) {
  global.__seonGameServer = createGameServer();
}

module.exports = (req, res) => {
  global.__seonGameServer.handleRequest(req, res);
};
