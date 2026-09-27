// retryrun.js：按预算重发并留账
import { canSend, isGone } from "./outbox.js";

const KINDS = ["send", "ack", "timeout"];

function cloneState(state) {
  const src = state || {};
  return {
    sent: Object.assign({}, src.sent),
    acked: (src.acked || []).slice(),
    dead: (src.dead || []).slice(),
    queue: (src.queue || []).slice(),
    applied: (src.applied || []).slice(),
    retries: Object.assign({}, src.retries)
  };
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export function step(spec) {
  const state = cloneState(spec.state);
  const events = spec.events || [];
  let budget = spec.budget || 0;
  const maxRetry = spec.max_retry || 0;
  const unknownAckCode = spec.unknown_ack_error_code || "E_UNKNOWN_ACK";
  const badEventCode = spec.event_error_code || "E_BAD_EVENT";
  const ackedSeq = [];
  const deadSeq = [];
  let resent = 0;
  let dupSend = 0;
  let dupTimeout = 0;
  let judged = 0;

  // 每次事件后按预算从队首重发；重试次数超过上限的进死信；预算用尽后队列压在账上
  function drain() {
    while (state.queue.length > 0) {
      const head = state.queue[0];
      const retries = state.retries[head] || 0;
      if (retries > maxRetry) {
        state.queue.shift();
        state.dead.push(head);
        deadSeq.push(head);
        continue;
      }
      if (budget > 0) {
        budget -= 1;
        state.retries[head] = retries + 1;
        state.sent[head] = (state.sent[head] || 0) + 1;
        resent += 1;
        continue;
      }
      break;
    }
  }

  for (const event of events) {
    if (!event || typeof event !== "object"
        || !Number.isFinite(event.id) || !Number.isFinite(event.msg)
        || KINDS.indexOf(event.kind) === -1) {
      fail(badEventCode, "bad event");
    }
    if (state.applied.indexOf(event.id) !== -1) {
      drain();
      continue;
    }
    state.applied.push(event.id);
    judged += 1;
    const msg = event.msg;
    if (event.kind === "send") {
      state.sent[msg] = (state.sent[msg] || 0) + 1;
      if (isGone(state, msg)) {
        dupSend += 1;
      }
    } else if (event.kind === "ack") {
      if (!state.sent[msg] || state.acked.indexOf(msg) !== -1) {
        fail(unknownAckCode, "unknown ack");
      }
      state.acked.push(msg);
      ackedSeq.push(msg);
      const at = state.queue.indexOf(msg);
      if (at !== -1) {
        state.queue.splice(at, 1);
      }
    } else {
      if (isGone(state, msg)) {
        dupTimeout += 1;
      } else if (state.queue.indexOf(msg) === -1) {
        state.retries[msg] = (state.retries[msg] || 0) + 1;
        state.queue.push(msg);
      }
    }
    drain();
  }

  return { state: state, acked_seq: ackedSeq, dead_seq: deadSeq, resent: resent,
           dup_send: dupSend, dup_timeout: dupTimeout, queue_before: state.queue.length,
           catchup: 0, pending_ids: state.queue.slice(),
           judged: judged, judged_bound: events.length };
}

export function close(spec) {
  const state = cloneState(spec.state);
  const maxRetry = spec.max_retry || 0;
  let catchup = 0;
  // 收尾不限预算，把队列发完
  while (state.queue.length > 0) {
    const head = state.queue[0];
    const retries = state.retries[head] || 0;
    if (retries > maxRetry) {
      state.queue.shift();
      state.dead.push(head);
      continue;
    }
    state.retries[head] = retries + 1;
    state.sent[head] = (state.sent[head] || 0) + 1;
    catchup += 1;
  }
  return { state: state, catchup: catchup };
}
