# GilbertOne's media studio

GilbertOne drawing, painting and animating, on its own server, behind the founder's login at
`https://<test chat address>/media/`. Asked for on 8 October 2026. The rules it keeps are
`packages/catalog/gilbertone-media.json`; this folder is the service that keeps them.

## What it makes

| Kind | How | Expected time on this CPU |
| --- | --- | --- |
| **Drawing** | Qwen writes an SVG; it is rebuilt from an allowlist and labelled | 1 to 5 minutes |
| **Picture** | FLUX.1 [schnell] (Apache-2.0), 4-bit, through stable-diffusion.cpp; label burned in | measured by `install.sh` |
| **Short video** | Qwen writes a 3 to 6 scene storyboard, each scene is a drawing with a caption, ffmpeg joins them with a slow push-in and crossfades; silent MP4 | 5 to 30 minutes |

Drawings are the main form on purpose. The scope (`docs/GilbertOne_Developer_Scope_v1.md`) already
chose SVG over generated video for GilbertOne's own character, and a drawing is fast on a CPU, needs
no second model, and cannot be mistaken for a photograph. True generated video (Wan, LTX and the
like) is not offered: without a GPU it takes hours a clip. The video kind says what it is.

## What it refuses

Before any model sees a request, and again after Qwen restates it in English (so a request in
isiXhosa meets the same rules):

- an emergency, answered with packages/gilbertone's own approved message and 10177 / 112;
- anything holding an ID, phone, email or medical-aid number;
- real or named people, deepfakes, "make it look like my…";
- official documents, badges and other organisations' logos (a sick note made here is a forgery);
- sexual, violent and weapon content;
- for pictures only: realistic wounds, rashes, scans and other clinical findings, and realistic children
  (a labelled drawing of the same thing is allowed).

Each refusal is a sentence in the contract, said word for word. Every result carries its label in the
pixels: "Drawn by GilbertOne…", "AI picture, not a photograph", "an animated drawing, not real footage".

## What it keeps

Nothing for long. Results are files on the server for an hour, then deleted. A request's words live
in memory only while its job runs and are never logged. The page uses no browser storage.

## How it runs

- One Node process (`src/server.ts`, run directly by Node's type stripping, no build, no npm
  dependency) inside the `gilbertone` container, on `127.0.0.1:8792`, as its own system user.
- It refuses to start without `MYTHUSO_GILBERTONE_MEDIA=private-preview`, and to bind beyond loopback.
- Caddy, already in the container for the test chat, routes `/media/` to it inside the same site
  block, so the same login covers it. No new port.
- One job at a time, three waiting at most.
- **One large model at a time.** Before a picture, it asks Ollama to unload `gilbertone-qwen` and waits
  until it has; the next chat question reloads Qwen (expect the first answer after a picture to take
  longer). A chat sent *while* a picture is painting reloads Qwen beside it: both fit (about 24 + 11 GB
  of the container's 40), but both run slower. If that is not acceptable, `--no-pictures` keeps the
  rule absolute.

## Installing it

On Gilbert's Mac, from a checkout of the branch:

```sh
tar czf - deploy/gilbertone-host/media packages/gilbertone/src/escalation.ts packages/gilbertone/src/phi.ts \
  packages/catalog/gilbertone-media.json | ssh <user>@<server> 'rm -rf ~/gilbertone-media-src && mkdir -p ~/gilbertone-media-src && tar xzf - -C ~/gilbertone-media-src'
ssh -t <user>@<server> 'sudo bash ~/gilbertone-media-src/deploy/gilbertone-host/media/install.sh'
```

The install builds stable-diffusion.cpp inside the container, downloads about 10 GB of picture model
(recording each file's SHA-256 the first time and refusing changed files after), paints one test
picture to time it, starts the service, and proves through the real address that the login is
required (401 without, 200 with) and that a sick-note request is refused (422). Its summary is in
`/etc/mythuso/gilbertone-media.txt`.

- `--no-pictures`: drawings and videos only; no build, no download.
- `--remove`: stops and removes the studio (add `--models` to delete the picture model too).

The chat page gains a **Draw** button next to **New chat** the next time `open-test-chat.sh` pushes
it; until then, open `/media/` directly.

## Before anyone but the founder uses it

The same conditions as the rest of this host (see `../README.md`), plus: a clinician reads a sample of
drawings in each language before a patient sees one, and the licence of every component stays in the
contract, checked by `scripts/check-boundaries.mjs`.
