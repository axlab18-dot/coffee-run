function createLobby() {
  return { players: [] };
}

function addPlayer(lobby, id, name, isBot = false) {
  lobby.players.push({ id, name, ready: false, isBot });
}

function removePlayer(lobby, id) {
  lobby.players = lobby.players.filter((p) => p.id !== id);
}

function setReady(lobby, id, ready) {
  const player = lobby.players.find((p) => p.id === id);
  if (player) player.ready = ready;
}

function allReady(lobby) {
  return lobby.players.length > 0 && lobby.players.every((p) => p.ready);
}

module.exports = { createLobby, addPlayer, removePlayer, setReady, allReady };
