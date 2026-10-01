import { closeSync, chmodSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, renameSync, statSync, writeSync } from "node:fs";
import { join } from "node:path";
import contract from "../../../../packages/catalog/founder-access.json" with { type: "json" };

/* The service's state directory, 28 September 2026 (packages/catalog/founder-access.json#state).

   WHAT IS KEPT HERE, AND WHAT NEVER IS. Until this day the assistant service wrote no file: sessions
   lived in memory and every credential came from an env file systemd handed it. The founder's
   instruction — "I need to be able to control all these aspects, I am the owner" — needs three things
   to outlive a restart: the settings history the speak route reads, the encrypted provider vault, and
   the founder audit a screen reads back. Those three files, and nothing else, live here. Nothing a
   patient said, heard or was told is ever written by this module or through it; there is no function
   in it that takes a transcript, a capture or an answer.

   WHERE IT IS. deploy/ops/assistant-api.service declares StateDirectory=mythuso-assistant and hands
   its path to the process in MYTHUSO_ASSISTANT_STATE_DIR. A process started without the variable — a
   developer's shell, a test, a box whose unit predates this — has no state: it reads the contract's
   defaults, answers every founder read honestly (persisted: false), and refuses every founder write
   with founder-state-unavailable rather than keeping a change in memory that would read as saved and
   vanish at the next restart. The directory is never created by this module when it is absent: what
   the variable names must exist, because a directory this process could invent is a directory nobody
   provisioned or set the mode of.

   HOW IT IS WRITTEN. Every file is 0600 — the unit's UMask=0077 already makes that so, and the mode is
   set explicitly anyway, because the property should be true of the file and not of the process that
   happened to create it. The two JSON-lines files are appended to and never rewritten; the vault is
   replaced whole, atomically, through a temporary file beside it and a rename, so a crash mid-write
   leaves the previous vault intact rather than half of a new one. */

export const STATE_VARIABLE: string = contract.state.variable;
export const FILE_MODE = 0o600;

export type Env = Record<string, string | undefined>;

export interface FounderState {
  readonly directory: string;
  /* Append one line to a JSON-lines file. The line is one JSON object with no newline in it. */
  appendLine(file: string, line: string): void;
  /* Every line of a JSON-lines file, oldest first; an absent file is an empty history. */
  readLines(file: string): string[];
  /* The whole lines in the last maxBytes of a JSON-lines file, oldest first. A line the window cut
     through is dropped rather than half-read; an absent file is an empty history. */
  readTail(file: string, maxBytes: number): string[];
  /* One JSON document, or null when the file does not exist. */
  readJson<T>(file: string): T | null;
  /* Replace one JSON document atomically, 0600. */
  writeJson(file: string, value: unknown): void;
}

/* The state directory the environment names, or null when it names none or names something that is
   not a directory. Read once, as every fact about how this process was started is. */
export function stateDirectory(env: Env = process.env): string | null {
  const named = (env[STATE_VARIABLE] ?? "").trim();
  if (!named) return null;
  try {
    return statSync(named).isDirectory() ? named : null;
  } catch {
    return null;
  }
}

export function openFounderState(directory: string): FounderState {
  const at = (file: string) => join(directory, file);
  return {
    directory,
    appendLine(file, line) {
      if (line.includes("\n")) throw new Error("a state line is one line");
      const fd = openSync(at(file), "a", FILE_MODE);
      try {
        writeSync(fd, line + "\n");
      } finally {
        closeSync(fd);
      }
      chmodSync(at(file), FILE_MODE);
    },
    readLines(file) {
      if (!existsSync(at(file))) return [];
      return readFileSync(at(file), "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
    },
    /* Added 1 October 2026 for the logs route, which used to read the founder audit whole on the event
       loop to answer two hundred lines of it: the file only grows, so what a read costs has to be
       bounded by the window and not by how long the service has been running. The settings history
       is still read whole, once, at start-up — a replay that skipped a line would be a different
       history. */
    readTail(file, maxBytes) {
      if (!existsSync(at(file))) return [];
      const fd = openSync(at(file), "r");
      try {
        const size = fstatSync(fd).size;
        /* One byte before the window, so a line that begins exactly at its edge is kept whole: the
           first piece is then the empty tail of the line before it, and that is what is dropped. */
        const start = Math.max(0, size - Math.max(0, Math.floor(maxBytes)) - 1);
        const window = Buffer.alloc(size - start);
        let read = 0;
        while (read < window.length) {
          const got = readSync(fd, window, read, window.length - read, start + read);
          if (got === 0) break;
          read += got;
        }
        const lines = window.subarray(0, read).toString("utf8").split("\n");
        if (start > 0) lines.shift();
        return lines.map((l) => l.trim()).filter(Boolean);
      } finally {
        closeSync(fd);
      }
    },
    readJson(file) {
      if (!existsSync(at(file))) return null;
      return JSON.parse(readFileSync(at(file), "utf8"));
    },
    writeJson(file, value) {
      const temporary = at(`${file}.new`);
      const fd = openSync(temporary, "w", FILE_MODE);
      try {
        writeSync(fd, JSON.stringify(value, null, 1) + "\n");
      } finally {
        closeSync(fd);
      }
      chmodSync(temporary, FILE_MODE);
      renameSync(temporary, at(file));
    },
  };
}

/* The state the environment gives this process, or null. mkdirSync is deliberately not called here:
   see the header. It is exported for the test harness alone, which makes its own temporary directory
   and hands it in through the same variable the unit uses. */
export function founderStateFrom(env: Env = process.env): FounderState | null {
  const directory = stateDirectory(env);
  return directory ? openFounderState(directory) : null;
}

/* For a test: a directory the test made, so the same code path that reads the unit's variable is the
   one exercised. */
export function ensureStateDirectory(directory: string): void {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
}
