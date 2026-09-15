import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseRoundRobinCounselor,
  isAutoAssignableCounselor,
} from "../src/utils/assignmentPolicy.js";

const counselors = [
  { id: "c", role: "counselor", assignedOpenCount: 0, lastAutoAssignedAt: 0 },
  { id: "a", role: "counselor", assignedOpenCount: 100, lastAutoAssignedAt: 999 },
  { id: "b", role: "counselor", assignedOpenCount: 5, lastAutoAssignedAt: 100 },
];

test("existing workload and assignment times do not affect equal rotation", () => {
  let lastCounselorId;
  const assignments = [];
  for (let index = 0; index < 9; index += 1) {
    const chosen = chooseRoundRobinCounselor(counselors, lastCounselorId);
    assignments.push(chosen.id);
    lastCounselorId = chosen.id;
  }
  assert.deepEqual(assignments, ["a", "b", "c", "a", "b", "c", "a", "b", "c"]);
});

test("every prefix is an equal split with at most one extra request per counselor", () => {
  for (let size = 1; size <= 20; size += 1) {
    const pool = Array.from({ length: size }, (_, index) => ({
      id: String(index).padStart(2, "0"),
      role: "counselor",
    }));
    const counts = Object.fromEntries(pool.map(({ id }) => [id, 0]));
    let lastCounselorId;
    for (let total = 1; total <= size * 10 + 1; total += 1) {
      const chosen = chooseRoundRobinCounselor(pool, lastCounselorId);
      counts[chosen.id] += 1;
      lastCounselorId = chosen.id;
      for (const count of Object.values(counts)) {
        assert.ok(count === Math.floor(total / size) || count === Math.ceil(total / size));
      }
    }
  }
});

test("saved cursor continues the same rotation across batches and reordered snapshots", () => {
  const first = chooseRoundRobinCounselor(counselors);
  const savedSettings = JSON.parse(JSON.stringify({ lastCounselorId: first.id }));
  const next = chooseRoundRobinCounselor([...counselors].reverse(), savedSettings.lastCounselorId);
  assert.equal(first.id, "a");
  assert.equal(next.id, "b");
  assert.equal(chooseRoundRobinCounselor(counselors, "c").id, "a");
});

test("all counselor accounts participate regardless of legacy assignment flags", () => {
  const pool = [
    { id: "a", role: "counselor", autoAssignmentEnabled: false },
    { id: "b", role: "counselor", disabled: true },
    { id: "0", role: "admin" },
    { id: "1", role: "user", disabled: true },
  ];
  assert.deepEqual(pool.filter(isAutoAssignableCounselor).map(({ id }) => id), ["a", "b"]);
  assert.equal(chooseRoundRobinCounselor(pool).id, "a");
  assert.equal(chooseRoundRobinCounselor(pool, "a").id, "b");
  assert.equal(isAutoAssignableCounselor(null), false);
});

test("removed counselors are skipped and new counselors join the rotation", () => {
  const remaining = counselors.filter(({ id }) => id !== "b");
  assert.equal(chooseRoundRobinCounselor(remaining, "b").id, "c");
  assert.equal(chooseRoundRobinCounselor(remaining, "z").id, "a");
  const expanded = [...remaining, { id: "b", role: "counselor" }];
  assert.equal(chooseRoundRobinCounselor(expanded, "a").id, "b");
});

test("empty pools return no counselor and missing cursors start at the first ID", () => {
  assert.equal(chooseRoundRobinCounselor([]), undefined);
  assert.equal(chooseRoundRobinCounselor([{ id: "a", role: "user" }]), undefined);
  const pool = [{ id: "1", role: "counselor" }, { id: "0", role: "counselor" }];
  for (const cursor of [undefined, null, ""]) {
    assert.equal(chooseRoundRobinCounselor(pool, cursor).id, "0");
  }
});

test("selecting a counselor does not mutate the input snapshot", () => {
  const before = structuredClone(counselors);
  chooseRoundRobinCounselor(counselors, "a");
  assert.deepEqual(counselors, before);
});
