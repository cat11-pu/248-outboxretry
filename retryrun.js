// retryrun.js：按预算重发并留账（基线：一律给空表）
import { canSend, isGone } from "./outbox.js";

export function step(spec) {
  return { state: spec.state, acked_seq: [], dead_seq: [], resent: 0, dup_send: 0, dup_timeout: 0,
           queue_before: 0, catchup: 0, pending_ids: [], judged: 0, judged_bound: 0 };
}

export function close(spec) {
  return { state: spec.state, catchup: 0 };
}
