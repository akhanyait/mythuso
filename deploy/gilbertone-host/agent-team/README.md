# The four-agent team

Four agents for the founder's own work, each a role on the GilbertOne host's Qwen (asked for on
8 October 2026). It is a work team, not GilbertOne: it never sees a patient and never answers one.

| Name | Role | Reports to | What it does | Tools |
| --- | --- | --- | --- | --- |
| **Thandi** | Project Manager (`pm`) | Gilbert | Takes every ask, splits it, hands each piece to the right teammate, checks what comes back and reports | hand work on, read files |
| **Lerato** | Specialist Lead Creative Graphics Designer, UI/UX (`designer`) | Thandi | Screens, layouts, copy, colour and type, SVGs, written as drafts | read and search files, write drafts |
| **Sipho** | Super All-Rounder Full Stack Developer (`developer`) | Thandi | Code on any layer, written as whole files at their repository path, as drafts | read and search files, write drafts |
| **GilbertTwo** | All-Rounder Admin (`admin`) | Thandi | Server commands, email, documents | read and search files, write drafts, queue a command, draft an email |

The roles are configuration: names, prompts, tools, who reports to whom and what each refuses are all
in `roles.json`. GilbertTwo is the founder's name for the admin agent; Thandi, Lerato and Sipho were
chosen on the founder's behalf and are the founder's to change. Change a role there; the engine in `agents.mjs` reads it on every run.

## What the team will not do

These are enforced in `agents.mjs`, not just asked for in a prompt, and `agents.test.mjs` proves each:

- **No command runs until you approve it.** GilbertTwo can only queue a command. It runs when you
  type `node team.mjs approve <number>`, read it, and type `yes`. It runs inside the `gilbertone`
  container, which cannot reach the server around it or any other server.
- **No email is sent.** No mailbox is connected, so an email is a draft you can read and copy. Sending
  would need a dedicated mailbox for the team (not your own), with IMAP and SMTP and an app password kept
  on the server, or a Google Workspace or Microsoft 365 account with read and send permission.
- **No file is changed.** The agents read only the work folder (`/srv/agent-team/work`), and every file
  they write is a draft under `/srv/agent-team/outbox/drafts/<role>/`.
- **Only Thandi, the PM, takes your ask and hands out work**, at most four pieces per ask.

## Speed

Qwen on this server answers at about 9 words a second on CPU, and one request at a time. The four
agents therefore take turns rather than working side by side: running them at once would split the
same speed four ways and finish no sooner. A short ask that the PM hands to one teammate makes about
four to eight model calls, so expect **a few minutes per ask, longer when it needs two or three
teammates**. That is an estimate from the measured speed, not yet timed on the server; `team.mjs`
prints how long each step took, and the first run will tell.

## Trying it

On the server, once (from a checkout of this repository):

```sh
sudo bash deploy/gilbertone-host/agent-team/install.sh .      # . gives the team a copy of the code to read
```

Then, whenever you want the team:

```sh
sudo incus exec gilbertone -- bash
cd /srv/agent-team
node team.mjs ask "Plan a one-page welcome screen for nurses, and draft the email inviting our first five"
node team.mjs pending          # commands and emails waiting for you
node team.mjs approve 1        # read it, then type yes to run it
node team.mjs as Lerato "…"    # one agent directly, skipping Thandi
node team.mjs roles            # who does what
```

Every run is saved in full under `/srv/agent-team/outbox/runs/`.
