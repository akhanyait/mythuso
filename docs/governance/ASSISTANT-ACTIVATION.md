# GilbertOne assistant service — the activation record

**Written 24 September 2026, three days after the fact.** The assistant service on `liqzar-server` was
switched on in production on 21 September 2026. This repository, `CLAUDE.md`, `deploy/README.md` and
`docs/governance/DPIA-DRAFT.md` went on describing it as "installed dark" until today. This file is the
record that should have existed on the day. Everything below was read off the box on 24 September; what
could not be read is said to be unknown, not inferred.

## What the box says

| Fact | Value | Where it was read |
|---|---|---|
| Unit enabled | 21 September 2026, 11:31:11 SAST | the `multi-user.target.wants/assistant-api.service` link's creation time, and the service's first `Started` line in the journal |
| Credentials file created | 21 September 2026, 11:29:27 SAST | `/etc/mythuso/assistant.env` birth time |
| Credentials file last changed | 22 September 2026, 21:42:12 SAST | its modification time. Most likely the Azure Speech pair being added by `configure-assistant-env.sh`; the box does not say |
| Production acknowledgement | Present: `MYTHUSO_ASSISTANT_PRODUCTION=acknowledged` | counted in the env file; the file was read for that line and the speech region only, never for a key |
| Model tier | Azure OpenAI configured, activated | `/assistant/health`: `azure:true, production:true, activated:true` |
| Model deployment | `gpt-4.1-mini` | `AZURE_OPENAI_MODEL`, read 24 September 2026. The value was printed; the endpoint and the key were not |
| Model region | **South Africa North** | Azure's own `x-ms-region` response header on a free `GET /openai/models` made from the box, 24 September 2026. A fact about where the model runs, not a residency decision (`DATA-RESIDENCY-OPTIONS.md` §7 is still blank) |
| Cloud voice | Azure Speech, `southafricanorth`. **Working since 24 September 2026, 17:40 SAST**, when the founder re-entered the key through `configure-assistant-env.sh`: an 84-character key, and a test sentence returned 24 KB of audio with no failure logged. Before that it was **not working**, as the rest of this row records | `AZURE_SPEECH_REGION`. `/assistant/health` reported `speech:true` because the key is present. But on 24 September a one-word request to `/assistant/v1/speak` failed, and the journal holds three `assistant.speak.failed` lines. The stored key is 140 characters long and contains spaces, where an Azure Speech key is 32 or 84 characters with none, so text was pasted in with it. Since the runtime published on 24 September, the service no longer calls such a key "configured": health answers `speech:false` and the panel stops asking a voice that can only fail. **To fix it, the founder re-enters the key:** `sudo /opt/mythuso/ops/configure-assistant-env.sh`, which now refuses a malformed key, then `sudo systemctl restart assistant-api.service` |
| Restarts seen in the journal | 21 September 11:31 and 13:25; 22 September 20:59; 24 September 08:53 (a unit change) and later on 24 September (to apply the day's runtime) | `journalctl -u assistant-api.service` |
| **Who activated it** | **Unknown.** Nothing on the box or in the repository names a person | — |
| **Under what approval** | **Unknown.** The RUNBOOK sequence requires the Azure data-processing and residency decision and a deployment approval before the acknowledgement line is written; neither is recorded anywhere this pass could find | `deploy/RUNBOOK.md`, "Activating the assistant service" |

## What this changes

The assistant is a production service answering members of the public, and every change to
`apps/assistant-api` is a production change. `./deploy/deploy.sh` publishes the runtime but never
restarts the service. Since 24 September it says so loudly when the running process is behind the file
it just published, and the restart remains a person's act.

The controls that were meant to precede activation are still open. There is no signed DPIA
(`docs/governance/DPIA-DRAFT.md` §12), no appointed Information Officer
(`docs/governance/INFORMATION-OFFICER.md`), no recorded residency decision
(`docs/governance/DATA-RESIDENCY-OPTIONS.md` §7) and no key-custody decision
(`docs/governance/KEY-CUSTODY-OPTIONS.md` §5). This record does not close any of them. It makes the gap
visible.

## Patient words in the service log — open, owned by the founder

Until the runtime published on 24 September, the service wrote one line per message to the journal,
carrying the message itself after `redactPHI`. That redaction removes identity, phone, email and
medical-aid numbers and nothing clinical, so a message about self-harm or a blood pressure reached the
log word for word. From 24 September the line carries the route and the length only
(`apps/assistant-api/src/routes/turn.ts`), confirmed in production by a test message logged as
`| 2 chars`.

The lines written between 21 and 24 September are still in the journal.

- **Decision:** open, recorded 24 September 2026 by the founder's choice to decide later. **Owner:** the
  founder. Options on file: delete the service's journal entries from before the fix; retain them under
  a recorded basis and period; or accept the risk in writing.
- **What happens if nobody decides.** The box's journal is capped at `MaxRetentionSec=2week` and
  `SystemMaxUse=400M`. That setting is in `/etc/systemd/journald.conf.d/bidza-cap.conf`, **BidZA's
  file, not MyThuso's**. So the entries age out by about 8 October 2026, but only for as long as a
  co-tenant keeps that setting. MyThuso does not control it and must not edit it. Letting them age out
  is a decision too, and it should be written down as one.

## Two more speech providers, built and refused offshore — 28 September 2026

On the founder's ask, adapters for OpenAI Whisper (hosted) and Alibaba Qwen (ASR and TTS through
DashScope) were built beside Azure Speech (`apps/assistant-api/src/lib/providers/`), and a selection
per direction added (`MYTHUSO_STT_PROVIDER`, `MYTHUSO_TTS_PROVIDER`; default `azure-speech`). **Neither
is configured anywhere, and neither has been exercised against its live API** — the request shapes
are from the vendors' documentation, and each adapter's header says so.

Neither provider has a South African region (OpenAI: United States; DashScope: Singapore or Beijing),
and `packages/catalog/api-registry.json` records a patient's capture and GilbertOne's spoken answer
as health-information flows to each. Because `DATA-RESIDENCY-OPTIONS.md` §7 is still blank, **the
service refuses to select either for those routes in production**: it starts, prints the registry's
own refusal (`no-offshore-speech-for-health-information-without-a-residency-decision`) and carries on
with Azure Speech, or with the speech-not-configured refusal where Azure is unconfigured. There is
deliberately no variable that overrides this. The three health-information flows to these providers
are recorded and counted among the flows with no residency decision, which remains the open gap this
record names above. Nothing about the running service on `liqzar-server` changed with this: the deploy
publishes the runtime and does not restart it, and the selection lines are not in its env file.

## When this file is updated

When somebody records who activated the service and under what approval. When the retention decision
above is made. And whenever the service is deactivated or reactivated: the date, who did it, and why.
