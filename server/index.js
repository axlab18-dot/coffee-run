const { createGameServer } = require('./app');

const { server } = createGameServer();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`SEON Battle Ball listening on http://localhost:${PORT}`);
});
