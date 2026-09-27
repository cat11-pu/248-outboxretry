// outbox.js：一条消息的判定（未确认且未死信则可发，已确认或已死信则落定）
export function canSend(state, msg) {
  const acked = (state && state.acked) || [];
  const dead = (state && state.dead) || [];
  return acked.indexOf(msg) === -1 && dead.indexOf(msg) === -1;
}

export function isGone(state, msg) {
  return !canSend(state, msg);
}
