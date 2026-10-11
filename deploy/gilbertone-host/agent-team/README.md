# The work team

Six agents for the founder's own work, each a role on the GilbertOne host's Qwen. Asked for on
11 October 2026, in place of the four-role draft (project manager, designer, one developer, admin).
It is a work team, not GilbertOne: it never sees a patient and never answers one.

| Name | Role | Reports to | What it does | Tools |
| --- | --- | --- | --- | --- |
| **Thandi** | Project Manager (`pm`) | Gilbert | Takes every ask, splits it, hands each piece to the right teammate, checks what comes back and reports | hand work on, read files |
| **Kabelo** | Enterprise Architect (`architect`) | Thandi | Where a change lives, which service owns it, what it must refuse, written as a draft | read and search files, write drafts |
| **Lerato** | Specialist Creative Designer, Senior UI/UX (`designer`) | Thandi | Screens, layouts, copy, colour and type, SVGs, written as drafts | read and search files, write drafts |
| **Sipho** | Specialist Full Stack Engineer (`engineer`) | Thandi | Code on any layer, one piece of the ask, written as whole files at their repository path | read and search files, write drafts |
| **Karabo** | Specialist Full Stack Engineer (`engineer-2`) | Thandi | The other piece. Same craft as Sipho, a separate draft, so the two do not rewrite one file | read and search files, write drafts |
| **Nomsa** | QA and Tester (`qa`) | Thandi | A test or a test note as a draft, and a check queued for Gilbert to approve | read and search files, write drafts, queue a command |

The roles are configuration: names, prompts, tools, who reports to whom and what each refuses are all
in `roles.json`. Thandi, Lerato and Sipho were already named on the founder's behalf in the four-role
draft. Kabelo, Karabo and Nomsa are named the same way, and all six are the founder's to change.
Change a role there; the engine in `agents.mjs` reads it on every run.

## Status

`status.html` is Gilbert's chat for the six roles: a rail of names and titles from `roles.json`,
each with their own colour and icon, and a one-line snippet of that person's sentence from
`status.json`. The thread is beside the rail, and the composer sits along the bottom. Typing @
offers the six. One @ duties one person, and more than one @ in a message is one shared thread,
held for each of them. A message with nobody named is held for the whole team. The Group control
does the same when two or more are chosen. The host team is not installed. The page says so at
the top of the conversation, in that file's own sentence. The next line says Qwen on the server
is not connected, and the board does not call it. The picker lists every Cursor model the
environment key can call. A duty sent with one of those models is written by that model, and the
reply names it. Recording a duty shows that person is writing, then paints their reply from the same response.
A duty can be pinned, marked done, or dismissed. The thread can be searched. Notices can be muted
for the Johannesburg day. Enter sends. A named group can be duty'd in one tap. Today's list can be
copied. The morning line counts who is on the rail and what is still held. An added person's craft
can be edited. Those notes stay under `work/`.
The page also polls the board. Up to three suggestions offer the next people on the rail.
A person can be added or removed on this screen; that list is kept under `work/`, and `roles.json`
stays the seed. A greeting and a question about the plan are answered from the duties already on the board.
Any other duty still gets that person's craft when no Cursor model is chosen. A chosen Cursor
model writes the reply instead, and the reply names that model. The board does not call Qwen.
With nobody named, Thandi replies that she is holding it for the whole
team and has not handed it on. The duty is held, in `status.json`'s own held
sentence, and written under `work/`, which git ignores. The board asks for the key in
`work/board.key` (query `k`, the session cookie, or a Bearer header). That file is not committed.
A recorded duty is listed under Notices, and the browser is asked once for a notification that
names who it was for and that it is held. It is not a patient page.

The microphone on the composer is the browser's own speech recognition, and only after a tap.
There is no wake word. A listen stops at 45 seconds and leaves the words in the box. The line
beside the mic says the browser may hand the words to its maker. If the browser has no
recognition, the mic says the words have to be typed. Nothing on the page pulses, and nobody is
marked as running. Outfit and Figtree are inlined from the faces the web already hosts.

```sh
node board.mjs                  # http://127.0.0.1:8765/status.html
node render-status.mjs          # rewrite status.html after a sentence changes
node render-status.mjs --check  # fail if the page has drifted, or a status names a role the roster does not have
```

No admin role is on this team. The earlier draft had one, for email and server commands. This ask
did not name an admin, and no mailbox is connected, so nobody can draft an email. The only commands
are the checks Nomsa queues.

## What the team will not do

These are enforced in `agents.mjs`, not just asked for in a prompt, and `agents.test.mjs` proves each:

- **No command runs until you approve it.** Nomsa can only queue a command. It runs when you type
  `node team.mjs approve <number>`, read it, and type `yes`. It runs inside the `gilbertone`
  container, which cannot reach the server around it or any other server. Nobody else can queue one.
- **No email is sent.** No role has a mailbox tool. The engine still refuses to send if a later role
  is given one: an email would be a draft, and the stub says what account access sending would need.
- **No file is changed.** The agents read only the work folder (`/srv/agent-team/work`), and every file
  they write is a draft under `/srv/agent-team/outbox/drafts/<role>/`.
- **Only Thandi, the PM, takes your ask and hands out work**, at most once per teammate.

## Speed

Qwen on this server answers at about 9 words a second on CPU, and one request at a time. The six
agents therefore take turns rather than working side by side: running them at once would split the
same speed and finish no sooner. A short ask that the PM hands to one teammate makes about four to
eight model calls, so expect **a few minutes per ask, longer when it needs two or three teammates**.
Briefing all five is the long path. That is an estimate from the measured speed, not yet timed on
the server; `team.mjs` prints how long each step took, and the first run will tell.

## Trying it

This folder is not on `main` until the branch is merged. The server fetches the branch itself.
Nothing here has been installed into the container by the session that wrote the roster: that
install is `sudo` on the GilbertOne host, from a machine that holds `~/.ssh/gilbertone`.

```sh
mkdir -p ~/mythuso-copy
curl -fsSL "https://codeload.github.com/akhanyait/mythuso/tar.gz/refs/heads/cursor/gilbertone-work-team-80ca" | tar -xz -C ~/mythuso-copy --strip-components=1
sudo bash ~/mythuso-copy/deploy/gilbertone-host/agent-team/install.sh ~/mythuso-copy   # the copy is what the team reads
```

It uses `gilbertone-qwen` when `bootstrap.sh` has built it, and otherwise the served Qwen with the
container's thread count sent on every call; it changes nothing about Ollama either way. It does
not install the assistant, and it does not touch liqzar-server.

Then, whenever you want the team:

```sh
sudo incus exec gilbertone -- bash
cd /srv/agent-team
node team.mjs ask "Plan a one-page welcome screen for nurses, and name the check that would cover it"
node team.mjs pending          # commands waiting for you
node team.mjs approve 1        # read it, then type yes to run it
node team.mjs as Lerato "…"    # one agent directly, skipping Thandi
node team.mjs roles            # who does what
```

Every run is saved in full under `/srv/agent-team/outbox/runs/`.
