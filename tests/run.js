import assert from "node:assert";
import { canSend, isGone } from "../outbox.js";
import { step, close } from "../retryrun.js";
import { render } from "../app.js";

const base = {
  state: { sent: {}, acked: [], dead: [], queue: [], applied: [] },
  events: [], budget: 1, max_retry: 1,
  unknown_ack_error_code: "E_UNKNOWN_ACK", event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("canSend returns a flag", () => {
  assert.strictEqual(typeof canSend(base.state, 1), "boolean");
});

check("isGone returns a flag", () => {
  assert.strictEqual(typeof isGone(base.state, 1), "boolean");
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render exposes budget flag", () => {
  assert.strictEqual(typeof render(base).budget_pair_differs, "boolean");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
