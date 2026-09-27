// app.js：渲染结果
import { canSend, isGone } from "./outbox.js";
import { step, close } from "./retryrun.js";

export function render(spec) {
  const events = spec.events || [];
  const half = Math.ceil(events.length / 2);
  const first = step(spec);
  const closed = close(Object.assign({}, spec, { state: first.state }));
  const r1 = step(Object.assign({}, spec, { events: events.slice(0, half) }));
  const r2 = step(Object.assign({}, spec, { state: r1.state, events: events.slice(half) }));
  const closedTwo = close(Object.assign({}, spec, { state: r2.state }));
  const replay = step(Object.assign({}, spec, { state: closed.state }));
  const wide = step(Object.assign({}, spec, { budget: spec.budget + 2 }));
  const full = step(Object.assign({}, spec, { budget: events.length + 2 }));
  const fullClosed = close(Object.assign({}, spec, { state: full.state }));
  const fingerprint = function (state) {
    return JSON.stringify({ sent: state.sent, acked: state.acked, dead: state.dead,
                            queue: state.queue, applied: state.applied.length });
  };
  return { acked_seq: first.acked_seq, dead_seq: closed.state.dead, resent: first.resent,
           dup_send: first.dup_send, dup_timeout: first.dup_timeout, queue_before: first.queue_before,
           pending_ids: first.pending_ids, catchup: closed.catchup,
           budget_pair_differs: first.resent !== wide.resent,
           two_round_mid_differs: fingerprint(r2.state) !== fingerprint(first.state),
           two_round_closed_equal: fingerprint(closedTwo.state) === fingerprint(closed.state),
           replay_new: replay.resent, judged: first.judged, judged_bound: first.judged_bound,
           full_diff: fingerprint(closed.state) === fingerprint(fullClosed.state) ? 0 : 1,
           count: events.length, tail: canSend({}, 1) ? 1 : 0 };
}
