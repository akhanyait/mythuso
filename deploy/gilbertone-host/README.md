# The GilbertOne host

The dedicated server GilbertOne's own model runs on: a South African VPS holding MyThuso alone, so
that the chat tier can answer from a model on hardware MyThuso controls instead of a provider's.
`docs/ROADMAP.md` asked for "a new, isolated server of their own. Never `liqzar-server`"; this is it.

Decided 6 October 2026 by the founder: self-hosted Qwen on this server is GilbertOne's main model,
with Azure OpenAI (South Africa North) kept as the fallback until Qwen passes the golden sets.

## What `bootstrap.sh` does, and what it does not

It is run once, by hand, on the new server. It:

- refuses to run anywhere that serves a co-tenant's site, or on anything but Ubuntu;
- turns on automatic security updates, a firewall that admits SSH and nothing else, and fail2ban;
- turns off SSH password login **only** when a key is already installed for the account that ran it,
  so it cannot lock its operator out;
- formats and mounts the 1 TB data disk at `/srv/gilbertone` **only if it is blank** (no partitions, no
  filesystem), and keeps the models there; a disk that is not blank is reported and never touched, and
  `GILBERTONE_DISK=/dev/…` names the disk when there is any doubt. On the Sive Host server, found on
  8 October 2026, the "1 TB" is not a disk of its own: it is about 1 TB left unallocated on the one
  1.5 TB disk, after the 500 GB system partition. The script does not partition a disk the system
  runs from, so it formats nothing there and the container lives on the system disk; giving the spare
  space its own partition is a separate, deliberate step by hand;
- builds **one Incus system container, `gilbertone`,** on that disk, capped at 10 of the 12 CPUs and
  40 GB of the 48 so the host can always be reached. Qwen and, later, the assistant service, its search
  index and its database all live inside it and nowhere else on the server, so GilbertOne cannot mix
  with anything else the server carries and can be snapshotted, backed up or removed as one thing. A
  container rather than a Lima VM because it needs no nested virtualisation and no RAM of its own;
  it has outbound network for updates and no inbound port at all;
- installs Ollama inside the container, bound to the container's own `127.0.0.1:11434`, one answer at
  a time, and restarts the container so systemd starts it with those settings (a `systemctl restart`
  cannot stop the installer's first copy across the container's AppArmor profile);
- installs Node.js 22 inside it from NodeSource, because Ubuntu's own is 18, and stops if it is older;
- pulls the pinned Qwen model that serves, `qwen3.6:35b-a3b-q4_K_M` (mixture-of-experts, 3B active, about
  24 GB, Apache-2.0), and records its digest. On this server on 8 October 2026 it answered at 8.9 tokens a
  second against 1.3 for the dense `qwen3.8:27b`; `QWEN_MODELS` times both again;
- installs Incus from Zabbly's stable repository where it publishes one for this release, because the
  distribution's 6.0.5 lets AppArmor block Ollama from stopping its own model runner inside the container;
- measures each one's tokens per second on this CPU, with thinking off, one thread per container CPU and one
  model loaded at a time, and writes what it found to `/etc/mythuso/gilbertone-host.txt`,
  including whether nested virtualisation (`/dev/kvm`, which Lima needs) is available;
- builds `gilbertone-qwen` from the served model with the container's thread count and an 8192-token
  window baked in, because GilbertOne calls Ollama's `/v1`, which ignores per-request options, and gives
  Ollama two slots so a turn's short entity pre-read does not evict its long rules-and-tools prompt.

It does **not** install the assistant service, open a public port, configure TLS, or touch
`liqzar-server`. Production still answers from Azure on `liqzar-server` exactly as before.

## Running it

From a checkout of this repository on your own machine:

```sh
scp deploy/gilbertone-host/bootstrap.sh <user>@<server>:
ssh <user>@<server>
sudo bash bootstrap.sh
```

Add your SSH key first (`ssh-copy-id <user>@<server>`) so the script can switch password login off.
The two models are about 42 GB together, roughly an hour to download on the 100 Mbps port.
Whichever answers fast enough becomes the main model; the other is removed with
`sudo incus exec gilbertone -- ollama rm <model>`. `sudo incus exec gilbertone -- bash` opens a shell inside the box.

Both are "thinking" models. Before the chat tier uses one, the orchestrator must ask for answers
without the reasoning trace, or a patient waits for text they never see.

## Trying Qwen in a browser: `open-test-chat.sh`

`sudo bash open-test-chat.sh` (from this folder, on the server) opens a one-page test chat at
`https://<ip-with-dashes>.sslip.io/`, or at `GILBERTONE_HOSTNAME` once a GilbertOne domain exists.
It is the first thing this server serves to the internet, so it is narrow: Caddy runs inside the
container with a Let's Encrypt certificate, the host forwards only ports 80 and 443 to it, every request
needs a login, and only `POST /api/chat` reaches Ollama, so the login cannot pull or delete models. The
password is made on the server, kept root-only in `/root/gilbertone-test-chat-login.txt` and printed
once on the terminal; it does not go in this repository or a chat. The page is the model on its own, not
GilbertOne, and says so: no safety checks, nothing about a real person's health, nothing kept.
`sudo bash open-test-chat.sh --close` shuts it again.

## GilbertOne in the box: `open-gilbertone.sh`, and `install.sh` for all of it

Asked for by the founder on 8 October 2026: GilbertOne wired to the self-hosted Qwen, with its modules
and knowledge bases attached. `open-gilbertone.sh` installs, inside the container and on its loopback
only:

- **the assistant service** (`gilbertone-assistant`, 127.0.0.1:8791) in test mode: `NODE_ENV` unset, no
  Azure key, no founder access, `OLLAMA_MODEL=gilbertone-qwen` and a 60-second budget. Every message meets
  the emergency recognition and the refusals first; Qwen sees only what those could not answer, with the
  catalogue's tools around it (knowledge search, symptom guidance, medicine facts and interactions,
  emergency numbers, coverage area);
- **the knowledge index**: Qdrant (pinned, checksum-checked) filled with the 261 entries of
  `packages/catalog/knowledge`, embedded by **bge-m3** in the same Ollama, so the knowledge search finds an
  entry by meaning as well as by words;
- **a second safety check**: **llama-guard3:1b** reads each answer Qwen writes, and anything but a plain
  "safe", or no verdict in time, is dropped for the classifier's own reply.

`open-test-chat.sh` then routes the test chat's `/assistant/v1/turn` and `/assistant/health` to it, behind
the same login, and closes plain Qwen's `/api/chat`. The page says under every answer which part answered,
and has a patient, nurse or doctor switch; today Qwen answers patients only, as the turn route decides,
and the page says so.

The media studio (`media/`, PR #24) shares this Ollama and unloads Qwen before each picture, so a
GilbertOne question asked while a picture is painting waits for Qwen to load again, and past the
60-second budget it gets the safe standard reply; the page then says Qwen did not answer in time. Ask
again once the picture is done. `open-test-chat.sh` imports the studio's Caddy route from
`/etc/caddy/gilbertone.d/`, and the chat links to it as **Draw**.

Still off: real patient details, any login but the founder's, the outside knowledge sources (all 14 dark in
`federation.json`), production mode, and mythuso.co.za's live GilbertOne, which still answers from Azure.

`install.sh` runs `bootstrap.sh`, `open-gilbertone.sh` and `open-test-chat.sh` in that order, and
`install-from-mac.sh` builds the two files it needs (`npm run assistant-runtime` and the bundled ingestion
script, into `dist/`), copies this folder to the server and runs it there:

```sh
bash deploy/gilbertone-host/install-from-mac.sh
```

## What has to be true before the assistant moves here

Moving `/assistant/` to this host is a production change, made by hand and recorded in
`docs/governance/ASSISTANT-ACTIVATION.md`. Before it:

1. `docs/governance/DATA-RESIDENCY-OPTIONS.md` §7 is signed, naming this host and confirming the
   datacentre is in South Africa.
2. Qwen matches or beats Azure on `npm run eval:gilbertone` and the golden sets, including each local
   language a clinician has read.
3. Backups leave the machine (condition R3), and the host's operator agreement (POPIA s 21) is on file.
4. `deploy.sh` learns a second target, with its own nginx and TLS, and the chat tier's `OLLAMA_URL`
   points at the model over the container's loopback, with the assistant
   service installed inside the same container and nginx on the host the only way in.
