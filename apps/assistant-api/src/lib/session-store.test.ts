import test from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_IDLE_MS,
  SESSION_LIMIT,
  createSessionStore,
} from "./session-store.ts";
import { createConversation } from "../../../../packages/gilbertone/src/conversation.ts";

/* The session store's policy, held still. These are characterization tests in the strict sense:
   they pin the behavior routes/turn.ts had inline before the SessionStore extraction of
   22 September 2026 — half an hour idle with the boundary on the second, a thousand sessions with
   the oldest gone first, reads that prune but never refresh, writes that refresh and never prune —
   so a later implementation (in this process or another) is held to the same numbers through the
   same interface. The defaults themselves are asserted, not only the mechanics: changing either
   number is a change to a promise the store's comment makes, and it fails here first. */

test("the numbers in force are the route's own: half an hour idle, a thousand sessions", () => {
  assert.equal(SESSION_IDLE_MS, 30 * 60 * 1000);
  assert.equal(SESSION_LIMIT, 1000);
});

test("a session is held at exactly the idle window and gone a millisecond past it, and a read does not refresh the clock", () => {
  const store = createSessionStore();
  const state = createConversation("session-ttl");
  store.write("session-ttl", state, 1_000);
  /* At exactly the window the entry is still held — the rule is "longer than", not "as long as". */
  assert.equal(
    store.read("session-ttl", 1_000 + SESSION_IDLE_MS),
    state,
    "held at exactly the idle window",
  );
  /* Read again a millisecond later: had the read above refreshed the clock, this one would find a
    session a millisecond young. It does not — only a write refreshes. */
  assert.equal(
    store.read("session-ttl", 1_000 + SESSION_IDLE_MS + 1),
    undefined,
    "evicted a millisecond past it, though it was read at the window",
  );
});

test("a write stamps the session active, so the thread somebody is using outlives a quieter one", () => {
  const store = createSessionStore({ idleMs: 1_000 });
  const active = createConversation("active");
  const quiet = createConversation("quiet");
  store.write("quiet", quiet, 0);
  store.write("active", active, 100);
  /* At 1,050 the quiet session is 1,050ms unread — past the window — and the active one 950ms,
   still inside it: the difference is the write, not the request. */
  assert.equal(
    store.read("quiet", 1_050),
    undefined,
    "the session nobody has written for over the window is gone",
  );
  assert.equal(
    store.read("active", 1_050),
    active,
    "the one written more recently is still held",
  );
  store.write("active", active, 1_050);
  assert.equal(
    store.read("active", 2_050),
    active,
    "a write refreshed the window it had nearly left",
  );
});

test("at the limit the oldest entries go first, and the prune leaves room for the one session the request may write", () => {
  const store = createSessionStore({ limit: 2 });
  const first = createConversation("first");
  const second = createConversation("second");
  const third = createConversation("third");
  store.write("first", first, 1);
  store.write("second", second, 2);
  store.write("third", third, 3);
  /* Three held against a limit of two. The read prunes back to one — room for the write that
    follows every read in the route — and the newest is the one that survives. */
  assert.equal(
    store.read("third", 4),
    third,
    "the newest session survives its own read",
  );
  assert.equal(store.read("first", 4), undefined, "the oldest went first");
  assert.equal(
    store.read("second", 4),
    undefined,
    "and the next oldest after it",
  );
  assert.equal(
    store.read("never-written", 4),
    undefined,
    "an id nothing holds answers nothing",
  );
});

test("a read at exactly the limit still frees a slot, and the map is per instance", () => {
  const store = createSessionStore({ limit: 2 });
  const a = createConversation("a");
  const b = createConversation("b");
  store.write("a", a, 1);
  store.write("b", b, 2);
  assert.equal(store.read("b", 3), b, "the session read is held");
  assert.equal(
    store.read("a", 3),
    undefined,
    "the older of the two went, leaving room for the next write",
  );
  store.write("b", b, 3);
  assert.equal(
    store.read("b", 3),
    b,
    "and the route writes its session straight back",
  );
  assert.equal(
    createSessionStore().read("b", 3),
    undefined,
    "a fresh store holds nothing — the map is per instance",
  );
});

test("the algorithm is pinned exactly: the prune deletes until the map is under the limit", () => {
  const store = createSessionStore({ limit: 1 });
  const held = createConversation("held");
  store.write("held", held, 1);
  /* At a limit of one the rule deletes everything held — including the session this very read is
    for — because it stops only once the map is below the limit. That is the algorithm as the
    route carried it, and production's limit of a thousand is what makes it a corner nothing
    meets; pinned so a change to it is a decision rather than a surprise. */
  assert.equal(store.read("held", 2), undefined);
});
