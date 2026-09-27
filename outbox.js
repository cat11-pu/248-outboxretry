// outbox.js：一条消息的落定判定（已确认或已死信即落定）
function norm(state) {
  return state || {};
}

export function canSend(state, msg) {
  const s = norm(state);
  const acked = Array.isArray(s.acked) ? s.acked : [];
  const dead = Array.isArray(s.dead) ? s.dead : [];
  return !acked.includes(msg) && !dead.includes(msg);
}

export function isGone(state, msg) {
  const s = norm(state);
  const acked = Array.isArray(s.acked) ? s.acked : [];
  const dead = Array.isArray(s.dead) ? s.dead : [];
  return acked.includes(msg) || dead.includes(msg);
}
