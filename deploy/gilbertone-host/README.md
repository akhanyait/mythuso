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
  `GILBERTONE_DISK=/dev/…` names the disk when there is any doubt;
- builds **one Incus system container, `gilbertone`,** on that disk, capped at 10 of the 12 CPUs and
  40 GB of the 48 so the host can always be reached. Qwen and, later, the assistant service, its search
  index and its database all live inside it and nowhere else on the server, so GilbertOne cannot mix
  with anything else the server carries and can be snapshotted, backed up or removed as one thing. A
  container rather than a Lima VM because it needs no nested virtualisation and no RAM of its own;
  it has outbound network for updates and no inbound port at all;
- installs Ollama inside the container, bound to the container's own `127.0.0.1:11434`, one answer at a time;
- pulls two pinned Qwen models and records each digest: `qwen3.8:27b`, the newest Qwen (dense, about 18 GB),
  and `qwen3.6:35b-a3b-q4_K_M` (mixture-of-experts, 3B active, about 24 GB), both Apache-2.0 (`QWEN_MODELS` overrides);
- measures each one's tokens per second on this CPU, with thinking off, inside the container's CPU cap, and writes what it found to `/etc/mythuso/gilbertone-host.txt`,
  including whether nested virtualisation (`/dev/kvm`, which Lima needs) is available.

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
