function applyDamage(player, amount) {
  if (player.finished || player.retired) return;
  player.hp = Math.max(0, player.hp - amount);
  if (player.hp === 0) {
    player.retired = true;
    player.resultReason = 'retired';
  }
}

module.exports = { applyDamage };
