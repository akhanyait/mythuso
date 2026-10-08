/* One job at a time, three waiting at most, nothing kept past the hour.

   One at a time because everything here runs on the same twelve CPUs as chat, and a picture holds the
   machine for minutes. Three waiting because a queue nobody can see the end of is a promise the
   service cannot keep. The hour is gilbertone-media.json's keeping.minutes: results are files on the
   server's disk, swept on a timer, and a job's words are dropped from memory as soon as it ends. */
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { contract, type Kind } from "./contract.ts";
import { makers as defaultMakers, Refused, type Made, type Tools } from "./make.ts";

export type State = "queued" | "working" | "done" | "refused" | "failed";

export interface Job {
  id: string;
  kind: Kind;
  state: State;
  step: string;
  createdAt: number;
  finishedAt?: number;
  words?: string;
  made?: Made;
  refusal?: string;
  sentence?: string;
}

const WAITING = 3;

export class Jobs {
  #jobs = new Map<string, Job>();
  #queue: Job[] = [];
  #busy = false;
  #tools: Tools;
  #makers: typeof defaultMakers;
  #now: () => number;

  constructor(tools: Tools, makers = defaultMakers, now = () => Date.now()) {
    this.#tools = tools;
    this.#makers = makers;
    this.#now = now;
  }

  /* Returns the job, or null when the queue is full and the caller must say so. */
  add(kind: Kind, words: string): Job | null {
    if (this.#queue.length >= WAITING) return null;
    const job: Job = { id: randomBytes(16).toString("hex"), kind, state: "queued", step: "Waiting its turn", createdAt: this.#now(), words };
    this.#jobs.set(job.id, job);
    this.#queue.push(job);
    void this.#next();
    return job;
  }

  get(id: string): Job | undefined {
    return this.#jobs.get(id);
  }

  position(job: Job): number {
    return this.#queue.indexOf(job) + 1;
  }

  async #next(): Promise<void> {
    if (this.#busy) return;
    const job = this.#queue.shift();
    if (!job) return;
    this.#busy = true;
    job.state = "working";
    try {
      job.made = await this.#makers[job.kind](job.id, job.words ?? "", this.#tools, (step) => { job.step = step; });
      job.state = "done";
      job.step = "Ready";
    } catch (error) {
      if (error instanceof Refused) {
        job.state = "refused";
        job.refusal = error.refusal;
        job.sentence = error.sentence;
      } else {
        /* The reason goes to the service's journal for the operator; the person is told plainly
           that it did not work, never a stack trace. The words are not in the journal line. */
        console.error(`media job ${job.id} (${job.kind}) failed: ${(error as Error).message}`);
        job.state = "failed";
        job.sentence = "Something went wrong on the server while making that. Nothing was kept. Please try again.";
      }
      job.step = "";
    } finally {
      delete job.words;
      job.finishedAt = this.#now();
      this.#busy = false;
      void this.#next();
    }
  }

  /* Deletes every result older than the contract's hour, file and record alike. */
  async sweep(): Promise<number> {
    const cutoff = this.#now() - contract.keeping.minutes * 60_000;
    let removed = 0;
    for (const job of this.#jobs.values()) {
      if (job.state === "queued" || job.state === "working" || (job.finishedAt ?? job.createdAt) > cutoff) continue;
      if (job.made) await rm(job.made.file, { force: true });
      this.#jobs.delete(job.id);
      removed += 1;
    }
    return removed;
  }
}
