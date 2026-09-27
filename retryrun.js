// retryrun.js：按预算重发并留账
import { canSend, isGone } from "./outbox.js";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function cloneState(state) {
  const s = state || {};
  return {
    sent: Object.assign({}, s.sent),
    acked: Array.isArray(s.acked) ? s.acked.slice() : [],
    dead: Array.isArray(s.dead) ? s.dead.slice() : [],
    queue: Array.isArray(s.queue) ? s.queue.slice() : [],
    applied: Array.isArray(s.applied) ? s.applied.slice() : []
  };
}

function checkEvent(event) {
  if (event === null || typeof event !== "object") fail("E_BAD_EVENT", "事件必须是对象");
  if (!Number.isFinite(event.id)) fail("E_BAD_EVENT", "事件 id 非法");
  if (event.kind !== "send" && event.kind !== "ack" && event.kind !== "timeout") {
    fail("E_BAD_EVENT", "未知事件 kind：" + String(event.kind));
  }
  if (!Number.isFinite(event.msg)) fail("E_BAD_EVENT", "事件 msg 非法");
}

// 按预算从队首重发：触顶进死信，预算用尽则压账。
function drain(state, budget, account) {
  while (state.queue.length > 0 && account.used < budget) {
    const msg = state.queue.shift();
    if (!canSend(state, msg)) continue;
    state.sent[msg] = (state.sent[msg] || 0) + 1;
    account.resent += 1;
    account.used += 1;
    if ((state.sent[msg] || 0) >= (account.maxRetry + 1)) {
      state.dead.push(msg);
    }
  }
}

export function step(spec) {
  spec = spec || {};
  const state = cloneState(spec.state);
  const events = Array.isArray(spec.events) ? spec.events : [];
  const budget = Number.isFinite(spec.budget) ? spec.budget : 0;
  const maxRetry = Number.isFinite(spec.max_retry) ? spec.max_retry : 0;
  const account = { used: 0, resent: 0, maxRetry };

  const ackedSeq = [];
  const deadSeq = [];
  let dupSend = 0;
  let dupTimeout = 0;
  let judged = 0;
  const deadAtStart = new Set(state.dead);

  for (const event of events) {
    checkEvent(event);
    if (state.applied.includes(event.id)) continue;
    state.applied.push(event.id);
    judged += 1;
    const msg = event.msg;

    if (event.kind === "send") {
      state.sent[msg] = (state.sent[msg] || 0) + 1;
      if (isGone(state, msg)) dupSend += 1;
    } else if (event.kind === "ack") {
      if (!(state.sent[msg] > 0) || state.acked.includes(msg)) {
        fail("E_UNKNOWN_ACK", "未知确认：消息 " + String(msg));
      }
      state.acked.push(msg);
      ackedSeq.push(msg);
      const at = state.queue.indexOf(msg);
      if (at !== -1) state.queue.splice(at, 1);
    } else if (event.kind === "timeout") {
      if (isGone(state, msg)) {
        dupTimeout += 1;
      } else if (!state.queue.includes(msg)) {
        state.queue.push(msg);
      }
    }

    drain(state, budget, account);
  }

  for (const msg of state.dead) {
    if (!deadAtStart.has(msg)) deadSeq.push(msg);
  }

  return {
    state,
    acked_seq: ackedSeq,
    dead_seq: deadSeq,
    resent: account.resent,
    dup_send: dupSend,
    dup_timeout: dupTimeout,
    queue_before: state.queue.length,
    pending_ids: state.queue.slice(),
    catchup: 0,
    judged,
    judged_bound: events.length
  };
}

// 收尾：不限预算把队列发完，触顶进死信，返回补齐条数。
export function close(spec) {
  spec = spec || {};
  const state = cloneState(spec.state);
  const maxRetry = Number.isFinite(spec.max_retry) ? spec.max_retry : 0;
  let catchup = 0;

  while (state.queue.length > 0) {
    const msg = state.queue.shift();
    if (!canSend(state, msg)) continue;
    state.sent[msg] = (state.sent[msg] || 0) + 1;
    catchup += 1;
    if ((state.sent[msg] || 0) >= maxRetry + 1) {
      state.dead.push(msg);
    }
  }

  return { state, catchup };
}
