import type { ConversationState } from "../../../../packages/gilbertone/src/conversation.ts";

/* The session store, extracted from routes/turn.ts on 22 September 2026 — the same map, the same
   two numbers, the same eviction, now behind an interface.

   Turns arrive one request at a time, so continuity has to live somewhere between them. It lives
   in memory, and nowhere else: nothing is written to disk and nothing survives a restart, which
   is the same promise the web's panel keeps — a conversation, not a record. The two numbers are
   the store's whole policy: a session nobody has asked about for half an hour is evicted, and the
   map can never hold more than a thousand sessions, oldest first out. The request's own sessionId
   names a conversation and never a person; a request without one gets a fresh session and its id
   back, so a caller can keep the thread without ever having been given an identity.

   The interface is the seam the route reads through. A deployment that one day moves sessions out
   of this process — the one change this file exists to make possible — writes another
   implementation of the same two calls, and session-store.test.ts holds any implementation to
   this one's policy through the interface alone. What a replacement may not change quietly:
   reads do not refresh a session's clock (only a write does), a read prunes before it answers,
   and the prune that runs at the map's limit leaves room for the one session the request may
   write after it. */

export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_LIMIT = 1000;

/* What a session entry is: the conversation's own state, and when anybody last wrote it. */
type SessionEntry = { state: ConversationState; lastActive: number };

export interface SessionStore {
  /* The conversation under this id, or undefined for one nothing holds — a caller that finds
     nothing opens a fresh conversation under the id, exactly as the route always has. Prunes
     before answering: the store's policy runs on reads, the way it ran on every request. */
  read(sessionId: string, now: number): ConversationState | undefined;
  /* Writes the state under the id and stamps it active at now. Never prunes: the request that
     writes has already read, and pruning mid-request would evict the session it is about to
     answer for. */
  write(sessionId: string, state: ConversationState, now: number): void;
}

/* The map, with the policy above and nothing else. idleMs and limit default to the numbers in
   force; they are parameters only so the tests can hold the boundaries without waiting half an
   hour or writing a thousand sessions. */
export function createSessionStore({
  idleMs = SESSION_IDLE_MS,
  limit = SESSION_LIMIT,
}: { idleMs?: number; limit?: number } = {}): SessionStore {
  const sessions = new Map<string, SessionEntry>();

  /* Evict what nobody is asking about — first anything idle, then the oldest entries — and leave
     room for the one session this request may create or refresh after it runs. */
  const prune = (now: number): void => {
    for (const [id, entry] of sessions)
      if (now - entry.lastActive > idleMs) sessions.delete(id);
    if (sessions.size < limit) return;
    const oldestFirst = [...sessions.entries()].sort(
      (a, b) => a[1].lastActive - b[1].lastActive,
    );
    for (const [id] of oldestFirst) {
      if (sessions.size < limit) return;
      sessions.delete(id);
    }
  };

  return {
    read(sessionId, now) {
      prune(now);
      return sessions.get(sessionId)?.state;
    },
    write(sessionId, state, now) {
      sessions.set(sessionId, { state, lastActive: now });
    },
  };
}
