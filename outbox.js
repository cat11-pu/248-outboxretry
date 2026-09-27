// outbox.js：一条事件的判定（基线：一律给可发）
export function canSend(state, msg) {
  return true;
}

export function isGone(state, msg) {
  return false;
}
