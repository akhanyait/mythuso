/* The one model this service talks to: the gilbertone-qwen already loaded in the container's Ollama,
   on its loopback. No second language model is installed for media, because the server must never
   hold two large models side by side; drawings and storyboards borrow the Qwen that chat uses, one
   request at a time, as Ollama is configured to serve. */

export interface Qwen {
  ask(system: string, user: string, opts?: { json?: boolean; maxTokens?: number }): Promise<string>;
  /* Asks Ollama to let Qwen go, and waits until it has, so a picture model never shares the memory. */
  unload(): Promise<void>;
}

export function ollama(base = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434", model = process.env.MEDIA_QWEN_MODEL ?? "gilbertone-qwen"): Qwen {
  return {
    async ask(system, user, opts = {}) {
      const response = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          think: false,
          ...(opts.json ? { format: "json" } : {}),
          options: { num_predict: opts.maxTokens ?? 3000, temperature: 0.4 },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(15 * 60_000),
      });
      if (!response.ok) throw new Error(`Qwen answered ${response.status}`);
      const body = (await response.json()) as { message?: { content?: string } };
      return body.message?.content ?? "";
    },
    async unload() {
      await fetch(`${base}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, keep_alive: 0 }),
      }).catch(() => undefined);
      for (let i = 0; i < 120; i += 1) {
        const ps = (await fetch(`${base}/api/ps`).then((r) => r.json()).catch(() => ({ models: [] }))) as { models?: { name?: string }[] };
        if (!ps.models?.some((m) => m.name?.split(":")[0] === model.split(":")[0])) return;
        await new Promise((r) => setTimeout(r, 1000));
      }
      throw new Error("Qwen did not unload within two minutes; a chat is probably still answering");
    },
  };
}
