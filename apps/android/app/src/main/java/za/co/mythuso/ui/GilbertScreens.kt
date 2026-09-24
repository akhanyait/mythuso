package za.co.mythuso.ui

import android.Manifest
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.outlined.LocalHospital
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import kotlinx.coroutines.launch
import za.co.mythuso.model.AssistantClient
import za.co.mythuso.model.BookingData
import za.co.mythuso.model.CrisisLinesData
import za.co.mythuso.model.Gilbert
import za.co.mythuso.model.GilbertChannel
import za.co.mythuso.model.GilbertData
import za.co.mythuso.model.GilbertLine
import za.co.mythuso.model.GilbertReply
import za.co.mythuso.model.GilbertTurn
import za.co.mythuso.model.HandoverOutcome
import za.co.mythuso.model.Handovers
import za.co.mythuso.model.PreviewStore
import za.co.mythuso.model.Pulse
import za.co.mythuso.model.unifiedApi
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/* GilbertOne on Android.
 *
 * Android had no assistant until 14 September 2026. It has the same one as the web and iOS now: every
 * sentence from packages/catalog/assistant.json through the generated AssistantData.kt, the matcher in
 * model/Assistant.kt, and the microphone in GilbertVoice.kt and nowhere else.
 *
 * WHERE IT LIVES. A floating orb, bottom right on every patient page of the shell (MainActivity), opens
 * GilbertOne in a bottom sheet over whatever the person was reading, as the orb does on the web. It is
 * also a route of its own, "GilbertOne", in the detail `when` in AccountScreens.kt. Neither asks the phone
 * for anything: RECORD_AUDIO is requested from this screen, after the contract's explanation, the
 * first time somebody taps to talk.
 *
 * WHAT A PERSON OPENED IT FOR decides the order: the sphere and its state in words, the way to speak,
 * the voice notice, the conversation, the suggested questions and the refusals. The composer is pinned
 * to the bottom with the sentence that must not scroll away — GilbertOne not recognising an emergency does
 * not mean there is not one. At the largest font scales that sentence moves to the head of the
 * conversation instead, because pinned it would take the screen.
 *
 * TAP TO TALK AND A LARGE STOP, for the reason the contract's gestureWhy gives: TalkBack turns a hold
 * into a separate gesture, and a tremor turns it into a lottery. The talk button is drawn only when the
 * on-device recogniser exists; otherwise the unavailable sentence is drawn in its place.
 *
 * THE SPHERE is a port of the iOS and web drawing onto one Canvas: golden-angle particles with no random
 * numbers, the Pulse state carried in form as well as tone, and `level` from onRmsChanged only while the
 * microphone is open. With animations removed in the phone's accessibility settings it is one still
 * frame and ignores the level. It is hidden from TalkBack; the state is a live region in words beside it.
 *
 * Colour. Words are white (12.04:1 on BrandInk) or BrandMint (8.09); BrandInk on the white field and
 * buttons (12.04). Orange marks the emergency question and the escalated sphere as an edge and a fill,
 * never as text. */

/* Where the assistant API is reached from this build: the emulator's alias for the machine's own
 * loopback (10.0.2.2), where the service binds. A physical phone cannot reach it, which is the truth
 * — the service is not deployed — and the local answer is what such a phone keeps. */
private const val ASSISTANT_BASE = "http://10.0.2.2:8791"

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun GilbertSheet(store: PreviewStore, onDismiss: () -> Unit, open: (String) -> Unit) {
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet, containerColor = BrandInk, contentColor = SurfaceWhite) {
        GilbertContent(store, open = { onDismiss(); open(it) }, close = onDismiss)
    }
}

/** The route in AccountScreens.kt, for a link or a More row that opens GilbertOne full screen. */
@Composable fun GilbertScreen(store: PreviewStore, open: (String) -> Unit) {
    Box(Modifier.fillMaxSize().background(BrandInk)) { GilbertContent(store, open = open, close = null) }
}

@Composable fun GilbertOrb(modifier: Modifier = Modifier, onClick: () -> Unit) {
    val reduced = prefersReducedMotion()
    Box(
        modifier
            .padding(end = ThusoSpacing.space16, bottom = ThusoSpacing.space12)
            .size(64.dp)
            .clip(CircleShape)
            .background(BrandInk)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics(mergeDescendants = true) { contentDescription = GilbertData.callToAction },
        contentAlignment = Alignment.Center
    ) {
        GilbertSphere(size = 76.dp, depth = 0, pulse = Pulse.IDLE, level = 0f, reduced = reduced)
    }
}

/* `store` is the one the home reads its next visit from, so GilbertOne names the same visit. */
@Composable private fun GilbertContent(store: PreviewStore, open: (String) -> Unit, close: (() -> Unit)?) {
    val context = LocalContext.current
    val listener = remember { GilbertListener(context) }
    val speaker = remember { GilbertSpeaker(context) }
    val reduced = prefersReducedMotion()
    val largeType = LocalDensity.current.fontScale >= 1.6f
    var turns by remember { mutableStateOf(Gilbert.opening()) }
    /* The simulated nurse queue this conversation is handed to, its reference there, what each handover
       turn's button did, and whether an emergency was ever answered — kept apart from the turns because
       the conversation is capped, and a dropped turn must not be what lowers an urgency. */
    var raised by remember { mutableStateOf(false) }
    var conversationRef by remember { mutableStateOf(java.util.UUID.randomUUID().toString()) }
    /* Bumped only when a conversation starts again, the one place the web bumps its refinement
       generation: a refinement already in flight must not replace an answer in a conversation it no
       longer belongs to. */
    var refineGeneration by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    val sent = remember { mutableStateMapOf<Int, HandoverOutcome>() }
    LaunchedEffect(turns) { if (turns.any { it.reply is GilbertReply.Emergency }) raised = true }
    var draft by remember { mutableStateOf("") }
    var correction by remember { mutableStateOf("") }
    val scroll = rememberScrollState()
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> listener.permissionAnswered(granted) }

    /* The microphone and the voice both end with the sheet, and with the app leaving the foreground. */
    DisposableEffect(context) {
        val lifecycle = (context as? ComponentActivity)?.lifecycle
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_STOP) { listener.cancel(); speaker.stop() } }
        lifecycle?.addObserver(observer)
        onDispose { lifecycle?.removeObserver(observer); listener.cancel(); speaker.shutdown() }
    }
    LaunchedEffect(listener.phase) { if (listener.phase == GilbertListener.Phase.HEARD) correction = listener.heard }
    /* After Send the sheet used to scroll to its foot — the refusals and the field — and leave the question
       and its answer far above. Now the top of the new exchange is brought into view, measured once it
       has been laid out, and TalkBack is told what GilbertOne said. */
    var latestTop by remember { mutableIntStateOf(0) }
    val view = LocalView.current
    LaunchedEffect(turns.lastOrNull()?.id) {
        if (turns.size <= 1) return@LaunchedEffect
        withFrameNanos { }
        if (reduced) scroll.scrollTo(latestTop) else scroll.animateScrollTo(latestTop)
        @Suppress("DEPRECATION") view.announceForAccessibility(spoken(turns.last()))
        /* And the same words to GilbertSpeaker, which reads voice.nativeSpeech's flag and the mute
           switch before it reaches for the engine at all. The reply is already on the screen above;
           this is a second reading of it, never the only place the words appear. */
        speaker.speak(spokenAloud(turns.last()))
    }

    val asked = turns.size > 1
    val latest = turns.last().reply
    val pulse = when (listener.phase) {
        GilbertListener.Phase.LISTENING -> Pulse.LISTENING
        GilbertListener.Phase.FINISHING -> Pulse.THINKING
        else -> if (asked) Gilbert.pulse(latest) else Pulse.IDLE
    }
    /* The native refinement, the acceptance apps/web/src/lib/gilbertone-bridge.ts applies word for
       word: a message the local matcher could not place is asked about at /assistant/v1/turn, but
       only when the unifiedApi flag is on — off by default, so a build with no service deployed
       makes no call at all — and the service's sentence replaces the local answer only when the
       generated client accepted it: a model tier named as the source and words that are not empty.
       Refused, unreachable, timed out, unusable: the local answer stands, the one the person
       already has on the screen. Nothing here waits on the network; the replacement is an
       improvement that arrives late or not at all. */
    val refine: (GilbertTurn) -> Unit = { candidate ->
        val asked = candidate.asked
        if (unifiedApi && asked != null && candidate.reply == GilbertReply.Unmatched) {
            val generation = refineGeneration
            val session = conversationRef
            scope.launch {
                val words = AssistantClient.refine(asked, session, "patient", ASSISTANT_BASE)
                if (generation == refineGeneration && words != null) {
                    val index = turns.indexOfFirst { it == candidate }
                    if (index >= 0) {
                        val refined = candidate.copy(reply = GilbertReply.Service(words))
                        val stillLast = index == turns.lastIndex
                        turns = turns.toMutableList().also { it[index] = refined }
                        /* The turn keeps its id, so the id-keyed announcement above does not fire for
                           it; the words are announced and read out here, and only while the
                           replacement is still the last turn the person can see. */
                        if (stillLast) {
                            view.announceForAccessibility(spoken(refined))
                            speaker.speak(spokenAloud(refined))
                        }
                    }
                }
            }
        }
    }
    val sendDraft = {
        if (draft.isNotBlank()) {
            turns = Gilbert.send(draft, GilbertChannel.TYPED, turns, store.visits.firstOrNull())
            draft = ""
            refine(turns.last())
        }
    }
    val sendCorrection = {
        turns = Gilbert.send(correction, GilbertChannel.SPOKEN, turns, store.visits.firstOrNull())
        correction = ""
        listener.sent()
        refine(turns.last())
    }

    CompositionLocalProvider(LocalOnStudioNight provides true, LocalContentColor provides SurfaceWhite) {
        Column(Modifier.fillMaxWidth().fillMaxHeight().imePadding()) {
            Column(
                Modifier.weight(1f).verticalScroll(scroll).padding(horizontal = ThusoSpacing.space20, vertical = ThusoSpacing.space16),
                verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space24)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(GilbertData.name, style = MaterialTheme.typography.titleLarge, color = SurfaceWhite, modifier = Modifier.semantics { heading() })
                        Text(GilbertData.descriptorLine, style = MaterialTheme.typography.bodySmall, color = BrandMint)
                    }
                }
                Stage(listener, pulse, latest, asked, reduced)
                VoiceArea(listener, correction, { correction = it }, sendCorrection) { ask.launch(Manifest.permission.RECORD_AUDIO) }
                NotConnected("voice")
                if (largeType) Silence()
                turns.forEach { turn ->
                    Box(Modifier.onGloballyPositioned { if (turn.id == turns.last().id) latestTop = it.positionInParent().y.toInt() }) {
                        TurnView(turn, open, onHandOver = { turns = Gilbert.handOver(turns, raised) }, sayUnavailable = !listener.available,
                            sent = sent[turn.id],
                            onSend = {
                                val reply = turn.reply as? GilbertReply.Handover
                                if (reply != null) sent[turn.id] = Handovers.handOver(store.handovers, conversationRef, reply.urgency)
                            })
                    }
                }
                /* Starting again is a new conversation: a new reference in the queue, nothing remembered. */
                Suggestions(asked, choose = { turns = Gilbert.choose(it, turns, store.visits.firstOrNull()) },
                    again = { refineGeneration += 1; turns = Gilbert.opening(); raised = false; sent.clear(); conversationRef = java.util.UUID.randomUUID().toString() })
                Refusals()
            }
            Composer(draft, { draft = it }, sendDraft, largeType, speaker)
        }
    }
}

@Composable private fun Stage(listener: GilbertListener, pulse: Pulse, latest: GilbertReply, asked: Boolean, reduced: Boolean) {
    val depth = if (asked) Gilbert.depth(latest) else 0
    val sphereSize = if (LocalDensity.current.fontScale >= 1.6f) 176.dp else 224.dp
    val drawing = @Composable { GilbertSphere(sphereSize, depth, pulse, if (listener.phase == GilbertListener.Phase.LISTENING && !reduced) listener.level else 0f, reduced) }
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
        val tappable = when (listener.phase) {
            GilbertListener.Phase.LISTENING -> GilbertData.voice.stopLabel
            GilbertListener.Phase.IDLE, GilbertListener.Phase.FAILED -> if (listener.available) GilbertData.voice.talkLabel else null
            else -> null
        }
        if (tappable != null) {
            Box(Modifier.clip(CircleShape).clickable(role = Role.Button) {
                if (listener.phase == GilbertListener.Phase.LISTENING) listener.stop() else listener.talk()
            }.semantics(mergeDescendants = true) { contentDescription = tappable }) { drawing() }
        } else drawing()
        /* The state, in words, and announced when it changes. Colour is never the only difference. */
        Text(
            pulse.spec.cue, style = MaterialTheme.typography.labelLarge, color = SurfaceWhite,
            modifier = Modifier
                .border(if (pulse == Pulse.ESCALATE) 2.dp else 1.dp, if (pulse == Pulse.ESCALATE) BrandOrange else BrandMint.copy(alpha = 0.62f), RoundedCornerShape(50))
                .padding(horizontal = ThusoSpacing.space12, vertical = ThusoSpacing.space4)
                .semantics { contentDescription = pulse.spec.announcement; liveRegion = LiveRegionMode.Polite }
        )
        val (name, figure) = when (latest) {
            is GilbertReply.Situation -> latest.situation.name to latest.situation.figure
            is GilbertReply.Emergency -> GilbertData.emergency.lines.firstOrNull()?.name to GilbertData.emergency.lines.firstOrNull()?.number
            /* Every other answer is named by the state pill above; a second label would say nothing. */
            else -> (if (asked) null else GilbertData.callToAction) to null
        }
        if (name != null) Text(name.uppercase(), style = MaterialTheme.typography.labelMedium, color = BrandMint)
        if (figure != null) Text(figure, style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.ExtraLight, color = SurfaceWhite)
    }
}

@Composable private fun VoiceArea(listener: GilbertListener, correction: String, onCorrection: (String) -> Unit, send: () -> Unit, askPermission: () -> Unit) {
    when (listener.phase) {
        GilbertListener.Phase.UNAVAILABLE -> NightNote(GilbertData.voice.unavailable)
        GilbertListener.Phase.REFUSED -> NightNote(GilbertData.voice.refused)
        GilbertListener.Phase.IDLE, GilbertListener.Phase.FAILED -> Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
            if (listener.phase == GilbertListener.Phase.FAILED) NightNote(GilbertData.voice.failed)
            FilledButton(GilbertData.voice.talkLabel, Modifier.heightIn(min = 52.dp)) { listener.talk() }
            Text(GilbertData.voice.howItWorks, style = MaterialTheme.typography.bodySmall, color = BrandMint)
        }
        GilbertListener.Phase.EXPLAINING -> NightCard {
            Text(GilbertData.voice.beforePermission, style = MaterialTheme.typography.bodyLarge, color = SurfaceWhite)
            FilledButton(GilbertData.voice.askPermissionLabel) { askPermission() }
            QuietButton(GilbertData.voice.notNowLabel) { listener.notNow() }
        }
        GilbertListener.Phase.OPENING -> Spacer(Modifier.height(0.dp))
        GilbertListener.Phase.LISTENING -> NightCard {
            Text(GilbertData.voice.captionsLabel, style = MaterialTheme.typography.labelMedium, color = BrandMint)
            Text(
                listener.captions.ifEmpty { "…" }, style = MaterialTheme.typography.titleMedium, color = SurfaceWhite,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
            )
            Button(
                onClick = { listener.stop() },
                modifier = Modifier.fillMaxWidth().heightIn(min = 60.dp),
                shape = RoundedCornerShape(ThusoRadius.control),
                colors = ButtonDefaults.buttonColors(containerColor = SurfaceWhite, contentColor = BrandInk)
            ) {
                Icon(Icons.Filled.Stop, null)
                Spacer(Modifier.width(ThusoSpacing.space8))
                Text(GilbertData.voice.stopLabel, style = MaterialTheme.typography.titleMedium)
            }
        }
        GilbertListener.Phase.FINISHING -> NightNote(Pulse.THINKING.spec.announcement)
        GilbertListener.Phase.HEARD -> NightCard {
            Text(GilbertData.voice.correctLabel, style = MaterialTheme.typography.labelMedium, color = BrandMint)
            OutlinedTextField(
                value = correction, onValueChange = onCorrection, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = plainKeyboard(ImeAction.Default),
                colors = fieldColours(), shape = RoundedCornerShape(ThusoRadius.control)
            )
            FilledButton(GilbertData.conversation.sendLabel, enabled = correction.isNotBlank()) { send() }
            QuietButton(GilbertData.voice.discardLabel) { onCorrection(""); listener.discard() }
        }
    }
}

@Composable private fun TurnView(turn: GilbertTurn, open: (String) -> Unit, onHandOver: () -> Unit, sayUnavailable: Boolean, sent: HandoverOutcome? = null, onSend: () -> Unit = {}) {
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
        turn.asked?.let { asked ->
            val said = if (turn.channel == GilbertChannel.SPOKEN) GilbertData.conversation.youSaid else GilbertData.conversation.youAsked
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
                Text(
                    asked, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = BrandInk,
                    modifier = Modifier.clip(RoundedCornerShape(ThusoRadius.control)).background(SurfaceWhite)
                        .padding(horizontal = ThusoSpacing.space16, vertical = ThusoSpacing.space8)
                        .semantics { contentDescription = "$said: $asked" }
                )
            }
        }
        NightCard {
            Text(GilbertData.name.uppercase(), style = MaterialTheme.typography.labelMedium, color = BrandMint, modifier = Modifier.clearAndSetSemantics {})
            when (val reply = turn.reply) {
                is GilbertReply.Situation -> Body(reply.situation.sentence)
                GilbertReply.Identity -> { Body(GilbertData.whatItIs); Body(GilbertData.whatItIsNot) }
                GilbertReply.Voice -> {
                    Body(GilbertData.voice.howItWorks)
                    GilbertData.refusals.firstOrNull { it.id == "no-audio-kept" }?.let { Body(it.statement) }
                    if (sayUnavailable) Body(GilbertData.voice.unavailable)
                }
                is GilbertReply.Emergency -> {
                    if (reply.groups.isNotEmpty()) {
                        Body(GilbertData.emergency.noticed)
                        reply.groups.forEach { group ->
                            Row(Modifier.height(IntrinsicSize.Min)) {
                                Box(Modifier.width(2.dp).fillMaxHeight().background(BrandOrange))
                                Spacer(Modifier.width(ThusoSpacing.space12))
                                Text(group.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = SurfaceWhite)
                            }
                        }
                    }
                    Body(GilbertData.emergency.headline, strong = true)
                    Body(GilbertData.emergency.lead)
                    Lines(GilbertData.emergency.lines)
                    Body(GilbertData.emergency.notAnAmbulance, quiet = true)
                    /* The crisis lines, after the ambulance numbers and in the same column, only when the crisis
                       words raised this answer — packages/catalog/crisis-lines.json, generated into CrisisLinesData. */
                    if (Gilbert.showsCrisisLines(reply.groups)) {
                        Body(CrisisLinesData.heading)
                        Lines(CrisisLinesData.lines)
                    }
                    FilledButton(GilbertData.emergency.sosLabel) { open("Thuso SOS") }
                }
                GilbertReply.Unmatched -> {
                    Body(GilbertData.unmatched.sentence, strong = true)
                    Body(GilbertData.unmatched.detail)
                    Body(GilbertData.unmatched.ifUrgent)
                    Lines(GilbertData.unmatched.lines)
                    FilledButton(GilbertData.unmatched.handoverLabel) { onHandOver() }
                    QuietButton(GilbertData.unmatched.sosLabel, urgent = true) { open("Thuso SOS") }
                }
                /* A sentence the service wrote for a message GilbertOne could not place, drawn with the
                   heading, disclosure and emergency numbers the contract fixes, so the words can never
                   appear without them. */
                is GilbertReply.Service -> {
                    Body(GilbertData.service.heading, strong = true)
                    Body(reply.text)
                    Body(GilbertData.service.disclosure, quiet = true)
                    Body(GilbertData.service.ifUrgent)
                    Lines(GilbertData.service.lines)
                    FilledButton(GilbertData.service.handoverLabel) { onHandOver() }
                    QuietButton(GilbertData.service.sosLabel, urgent = true) { open("Thuso SOS") }
                }
                /* What goes, what does not, and the one button that sends it to the simulated nurse queue.
                   After the button: what happened, the reference, and the ambulance numbers, because a
                   queue nobody reads must never be the last thing an urgent person is shown. */
                is GilbertReply.Handover -> {
                    val h = GilbertData.handover
                    Body(h.title, strong = true)
                    /* Out of hours, before anything else about the handover: nobody is there, then the emergency
                       numbers, then a call back when the desk opens — from Access's generated handover hours.
                       Neither of the first two is a setting, so no hours can take them out. */
                    val desk = Handovers.desk()
                    if (!desk.open) {
                        Body(BookingData.Handover.outOfHours, strong = true)
                        Body(BookingData.Handover.outOfHoursNumbers, strong = true)
                        Handovers.opensWords(desk)?.let { Body(BookingData.Handover.callback.replace("{when}", it)) }
                    }
                    Body(h.lead)
                    reply.rows.forEach { row ->
                        Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}) {
                            Text(row.label, style = MaterialTheme.typography.labelMedium, color = BrandMint)
                            Text(row.value, style = MaterialTheme.typography.bodyLarge, color = SurfaceWhite)
                        }
                    }
                    Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}) {
                        Text(BookingData.Handover.answeredByLabel, style = MaterialTheme.typography.labelMedium, color = BrandMint)
                        Text(BookingData.Handover.answeredBy.joinToString(", "), style = MaterialTheme.typography.bodyLarge, color = SurfaceWhite)
                    }
                    if (reply.urgency == "emergency") Body(h.neverLowered, strong = true)
                    Text(h.notCarriedHeading, style = MaterialTheme.typography.labelMedium, color = BrandMint, modifier = Modifier.semantics { heading() })
                    h.notCarried.forEach { item ->
                        Row(Modifier.height(IntrinsicSize.Min)) {
                            Box(Modifier.width(2.dp).fillMaxHeight().background(BrandMint))
                            Spacer(Modifier.width(ThusoSpacing.space12))
                            Body(item.sentence)
                        }
                    }
                    if (sent != null) {
                        Body(if (sent.sentNow) h.sentTitle else h.alreadySent, strong = true)
                        if (sent.sentNow) Body(h.sent)
                        Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}) {
                            Text(h.sentReference, style = MaterialTheme.typography.labelMedium, color = BrandMint)
                            Text(sent.handover.reference, style = MaterialTheme.typography.titleMedium, color = SurfaceWhite)
                        }
                        Body(h.stillUrgent)
                        Lines(h.lines)
                    } else {
                        Body(h.notSent, strong = true)
                        FilledButton(h.sendLabel) { onSend() }
                    }
                }
            }
            /* Words GilbertOne did not read are said to be unread, with the numbers beside them, rather than
               answered around. See readEverything in the contract. */
            if (turn.unread) Unread(open, onHandOver)
        }
    }
}

/* The unread answer. Guiding, never a calm Idle: the words GilbertOne could not read may be the ones that mattered. */
@Composable private fun Unread(open: (String) -> Unit, onHandOver: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
        Box(Modifier.fillMaxWidth().height(2.dp).background(BrandOrange).clearAndSetSemantics {})
        Body(GilbertData.unread.sentence, strong = true)
        Body(GilbertData.unread.detail)
        Body(GilbertData.unread.ifUrgent)
        Lines(GilbertData.unread.lines)
        FilledButton(GilbertData.unread.handoverLabel) { onHandOver() }
        QuietButton(GilbertData.unread.sosLabel, urgent = true) { open("Thuso SOS") }
    }
}

/* Autocorrection off, which is what the app controls; suggestions are the keyboard's, and a keyboard that
   learns from what is typed may send it somewhere. The dictation key cannot be removed by an app, so the
   keyboard note beside the field says whose it is rather than the screen pretending it is not there. */
private fun plainKeyboard(ime: ImeAction) =
    KeyboardOptions(autoCorrectEnabled = false, keyboardType = KeyboardType.Text, capitalization = KeyboardCapitalization.None, imeAction = ime)

/* The words behind every reply kind, shared between what TalkBack is told and what GilbertSpeaker reads
   aloud — one `when` rather than two that could answer the same turn differently. */
private fun coreWords(turn: GilbertTurn): String = when (val reply = turn.reply) {
    is GilbertReply.Situation -> reply.situation.sentence
    GilbertReply.Identity -> GilbertData.whatItIs
    GilbertReply.Voice -> GilbertData.voice.howItWorks
    /* A crisis answer is read with its numbers — the ambulance first, then the crisis lines — because the
       lines are the reason it differs, and a reading that left them out would be a different answer. Any
       other emergency is read as it always was. */
    is GilbertReply.Emergency -> if (!Gilbert.showsCrisisLines(reply.groups)) GilbertData.emergency.headline
        else (listOf(GilbertData.emergency.headline) + GilbertData.emergency.lines.map { "${it.number}, ${it.name}." }
            + CrisisLinesData.heading + CrisisLinesData.lines.map { "${it.number}, ${it.name}." }).joinToString(" ")
    GilbertReply.Unmatched -> GilbertData.unmatched.sentence
    is GilbertReply.Service -> (listOf(GilbertData.service.heading, reply.text, GilbertData.service.disclosure, GilbertData.service.ifUrgent)
        + GilbertData.service.lines.map { "${it.number}, ${it.name}." }).joinToString(" ")
    is GilbertReply.Handover -> GilbertData.handover.title
}

/* What TalkBack is told when a reply arrives: its first sentence, and that words were left unread. */
private fun spoken(turn: GilbertTurn): String {
    val first = coreWords(turn)
    return if (turn.unread) "${GilbertData.name}: $first ${GilbertData.unread.sentence}" else "${GilbertData.name}: $first"
}

/* The same words, without the name spoken first: the sphere already says who is answering, and a voice
   does not need to introduce itself before every sentence the way TalkBack announcing a new element
   does. Matches spokenOf's own shape on the web and AssistantView.swift's spokenAloud on iOS. */
private fun spokenAloud(turn: GilbertTurn): String {
    val first = coreWords(turn)
    return if (turn.unread) "$first ${GilbertData.unread.sentence}" else first
}

/* The numbers in a real column, printed and never dialled: the SOS screen says nothing here dials. */
@Composable private fun Lines(lines: List<GilbertLine>) {
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
        lines.forEach { line ->
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.semantics(mergeDescendants = true) {}) {
                Text(line.number, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold, color = SurfaceWhite, modifier = Modifier.widthIn(min = 80.dp))
                Spacer(Modifier.width(ThusoSpacing.space12))
                Text(line.name, style = MaterialTheme.typography.bodyLarge, color = SurfaceWhite)
            }
        }
    }
}

@Composable private fun Suggestions(asked: Boolean, choose: (za.co.mythuso.model.GilbertQuestion) -> Unit, again: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space20)) {
        GilbertData.questionGroups.forEach { group ->
            Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
                Text(group.heading, style = MaterialTheme.typography.titleMedium, color = SurfaceWhite, modifier = Modifier.semantics { heading() })
                group.lead?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = BrandMint) }
                GilbertData.questions.filter { it.group == group.id }.forEach { question ->
                    QuietButton(question.asks, urgent = question.answer == "emergency") { choose(question) }
                }
            }
        }
        if (asked) TextButton(onClick = again, modifier = Modifier.heightIn(min = TouchTarget)) {
            Icon(Icons.Outlined.Refresh, null, tint = SurfaceWhite)
            Spacer(Modifier.width(ThusoSpacing.space8))
            Text(GilbertData.conversation.startAgainLabel, color = SurfaceWhite)
        }
    }
}

@Composable private fun Refusals() {
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
        Text(GilbertData.conversation.refusalsHeading, style = MaterialTheme.typography.titleMedium, color = SurfaceWhite, modifier = Modifier.semantics { heading() })
        NightCard { GilbertData.refusals.forEach { Text(it.statement, style = MaterialTheme.typography.bodyMedium, color = SurfaceWhite) } }
        Text("${GilbertData.poweredBy}. ${GilbertData.poweredByMeans}", style = MaterialTheme.typography.bodySmall, color = BrandMint)
    }
}

@Composable private fun Silence() {
    Text(GilbertData.silenceIsNotSafety, style = MaterialTheme.typography.bodySmall, color = BrandMint)
}

/* The keyboard note shows while the field has the keyboard, which is when the keyboard's microphone key
   is on the screen; pinned all the time it took the conversation's room, which iOS's accessibility audit
   caught on the same layout. */
@Composable private fun Composer(draft: String, onDraft: (String) -> Unit, send: () -> Unit, largeType: Boolean, speaker: GilbertSpeaker) {
    var typing by remember { mutableStateOf(false) }
    Column(
        Modifier.fillMaxWidth().background(BrandInk).navigationBarsPadding()
            .padding(horizontal = ThusoSpacing.space20, vertical = ThusoSpacing.space12),
        verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)
    ) {
        HorizontalDivider(color = BrandMint.copy(alpha = 0.22f))
        Text(GilbertData.conversation.inputLabel, style = MaterialTheme.typography.labelLarge, color = SurfaceWhite, modifier = Modifier.clearAndSetSemantics {})
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
            /* No floating label. On the night ground a label cut a dark notch in the field's top border
               with nothing visible in it; the heading above is the field's name instead, and TalkBack
               reads the same words. */
            OutlinedTextField(
                value = draft, onValueChange = onDraft, singleLine = true,
                placeholder = { Text(GilbertData.conversation.inputHint) },
                keyboardOptions = plainKeyboard(ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { send() }),
                colors = fieldColours(), shape = RoundedCornerShape(ThusoRadius.control),
                modifier = Modifier.weight(1f).onFocusChanged { typing = it.isFocused }
                    .semantics { contentDescription = GilbertData.conversation.inputLabel }
            )
            SpeechToggle(speaker)
            FilledButton(GilbertData.conversation.sendLabel, Modifier.wrapContentWidth(), fill = false) { send() }
        }
        if (typing) Text(GilbertData.conversation.keyboardNote, style = MaterialTheme.typography.bodySmall, color = BrandMint)
        if (!largeType) Silence()
    }
}

/* The speaker button beside the field: the composer's own control for GilbertSpeaker, drawn only while
   voice.nativeSpeech is on. A tap mutes or unmutes; muting stops the sentence GilbertOne is part-way
   through as well as every reply after it, because a control that only changes future replies while the
   room can still hear the current one is not a mute. */
@Composable private fun SpeechToggle(speaker: GilbertSpeaker) {
    if (!GilbertData.voice.nativeSpeechEnabled) return
    val label = if (speaker.muted) GilbertData.voice.unmuteLabel else GilbertData.voice.muteLabel
    IconButton(
        onClick = { speaker.muted = !speaker.muted; if (speaker.muted) speaker.stop() },
        modifier = Modifier.size(TouchTarget).semantics { contentDescription = label }
    ) {
        Icon(if (speaker.muted) Icons.AutoMirrored.Filled.VolumeOff else Icons.AutoMirrored.Filled.VolumeUp, null, tint = SurfaceWhite)
    }
}

// Small pieces on the night ground.

@Composable private fun fieldColours() = OutlinedTextFieldDefaults.colors(
    focusedContainerColor = SurfaceWhite, unfocusedContainerColor = SurfaceWhite,
    focusedTextColor = BrandInk, unfocusedTextColor = BrandInk, cursorColor = BrandInk,
    focusedBorderColor = BrandMint, unfocusedBorderColor = BrandMint.copy(alpha = 0.62f),
    focusedLabelColor = BrandInk, unfocusedLabelColor = BrandInk,
    focusedPlaceholderColor = BrandInk.copy(alpha = 0.62f), unfocusedPlaceholderColor = BrandInk.copy(alpha = 0.62f)
)

@Composable private fun NightCard(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(ThusoRadius.card)).background(SurfaceWhite.copy(alpha = 0.06f))
            .border(1.dp, SurfaceWhite.copy(alpha = 0.16f), RoundedCornerShape(ThusoRadius.card)).padding(ThusoSpacing.space16),
        verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12), content = content
    )
}

@Composable private fun NightNote(text: String) {
    Text(
        text, style = MaterialTheme.typography.bodyMedium, color = SurfaceWhite,
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(ThusoRadius.control)).background(SurfaceWhite.copy(alpha = 0.08f)).padding(ThusoSpacing.space12)
    )
}

@Composable private fun Body(text: String, strong: Boolean = false, quiet: Boolean = false) {
    Text(text, style = MaterialTheme.typography.bodyLarge, fontWeight = if (strong) FontWeight.SemiBold else FontWeight.Normal, color = if (quiet) BrandMint else SurfaceWhite)
}

@Composable private fun FilledButton(label: String, modifier: Modifier = Modifier, enabled: Boolean = true, fill: Boolean = true, onClick: () -> Unit) {
    Button(
        onClick = onClick, enabled = enabled,
        modifier = (if (fill) modifier.fillMaxWidth() else modifier).heightIn(min = TouchTarget),
        shape = RoundedCornerShape(ThusoRadius.control),
        colors = ButtonDefaults.buttonColors(containerColor = SurfaceWhite, contentColor = BrandInk, disabledContainerColor = SurfaceWhite.copy(alpha = 0.4f), disabledContentColor = BrandInk)
    ) {
        if (label == GilbertData.voice.talkLabel) { Icon(Icons.Outlined.Mic, null); Spacer(Modifier.width(ThusoSpacing.space8)) }
        if (label == GilbertData.unmatched.handoverLabel) { Icon(Icons.Outlined.Person, null); Spacer(Modifier.width(ThusoSpacing.space8)) }
        if (label == GilbertData.emergency.sosLabel) { Icon(Icons.Outlined.LocalHospital, null); Spacer(Modifier.width(ThusoSpacing.space8)) }
        Text(label, fontWeight = FontWeight.SemiBold)
    }
}

@Composable private fun QuietButton(label: String, urgent: Boolean = false, onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget),
        shape = RoundedCornerShape(ThusoRadius.control),
        border = BorderStroke(if (urgent) 2.dp else 1.dp, if (urgent) BrandOrange else BrandMint.copy(alpha = 0.62f)),
        colors = ButtonDefaults.outlinedButtonColors(containerColor = SurfaceWhite.copy(alpha = 0.07f), contentColor = SurfaceWhite)
    ) {
        Text(label, modifier = Modifier.fillMaxWidth())
    }
}

/* ---- GilbertOne Pulse, drawn ----------------------------------------------------------------------
 *
 * The same sphere as AssistantSphere.swift and AssistantSphere.tsx, simplified to what one Canvas draws
 * well: an edgeless bleed, three halo rings, two tilted orbits whose light travels round them, a body lit
 * from the upper left with a rim and one highlight, twenty-six particles and, while the microphone is
 * open, a rippling surface with rings shed outwards. Every particle's orbit, size and twinkle comes from
 * its index through the golden angle; nothing here calls a random number generator, so the same moment
 * draws the same frame.
 *
 * The clock advances at thirty frames a second from withFrameMillis and is read only inside the draw
 * lambda, so a frame is a redraw and not a recomposition. With animations removed it never advances,
 * the level is ignored and the frame is the composed still moment.
 */
private const val STILL_MOMENT = 2.35

@Composable fun GilbertSphere(size: Dp, depth: Int, pulse: Pulse, level: Float, reduced: Boolean) {
    var clock by remember { mutableDoubleStateOf(STILL_MOMENT) }
    LaunchedEffect(reduced) {
        if (reduced) { clock = STILL_MOMENT; return@LaunchedEffect }
        var start = -1L
        var last = 0L
        while (true) {
            withFrameMillis { now ->
                if (start < 0) start = now
                if (now - last >= 33) { last = now; clock = STILL_MOMENT + (now - start) / 1000.0 }
            }
        }
    }
    val heard = if (reduced) 0f else level.coerceIn(0f, 1f)
    val step = depth.coerceIn(0, 3)
    Canvas(Modifier.size(size).clearAndSetSemantics {}) {
        val t = clock
        val extent = this.size.minDimension
        val centre = Offset(this.size.width / 2, this.size.height / 2)
        val breath = if (reduced) 0.0 else sin(t * 2 * PI / 6.5)
        val accent = if (pulse == Pulse.ESCALATE) BrandOrange else BrandGreen
        val glint = if (pulse == Pulse.ESCALATE) BrandOrange else BrandLime

        // The bleed: no edge anywhere.
        val bleed = extent * (0.54f - step * 0.035f) * (1f + 0.05f * breath.toFloat() + 0.20f * heard)
        drawCircle(Brush.radialGradient(listOf(accent.copy(alpha = if (pulse == Pulse.ESCALATE) 0.46f else 0.58f), accent.copy(alpha = 0.22f), BrandMint.copy(alpha = 0.06f), Color.Transparent), centre, bleed), bleed, centre)

        // Three halo rings.
        val halo = 1f + 0.14f * heard
        listOf(0.74f to 0.16f, 0.86f to 0.10f, 0.98f to 0.05f).forEach { (d, a) ->
            drawCircle(BrandMint.copy(alpha = a), extent * d / 2 * halo, centre, style = Stroke(1.dp.toPx()))
        }

        // Two tilted orbits, their light travelling round.
        val orbitGrow = 1f + 0.10f * heard
        listOf(Triple(1.00f, 0.34f, -21f), Triple(0.84f, 0.23f, 27f)).forEachIndexed { index, (w, flat, tilt) ->
            val angle = (if (index == 0) t * 16 else -t * 11).toFloat()
            rotate(tilt + (if (index == 0) 2.5f else -3f) * breath.toFloat(), centre) {
                scale(1f, flat, centre) {
                    rotate(angle, centre) {
                        drawCircle(
                            Brush.sweepGradient(listOf(Color.Transparent, BrandMint.copy(alpha = if (index == 0) 1f else 0.8f), glint.copy(alpha = if (pulse == Pulse.THINKING || pulse == Pulse.ESCALATE) 0.95f else 0.5f), Color.Transparent, Color.Transparent), centre),
                            extent * w / 2 * orbitGrow, centre, style = Stroke((if (index == 0) 1.6f else 1.2f).dp.toPx() / flat)
                        )
                    }
                }
            }
        }

        // The body, lit from the upper left, dimmed while a handover is on screen.
        val body = extent * 0.315f * (1f + 0.018f * breath.toFloat() + 0.09f * heard)
        val bodyAlpha = if (pulse == Pulse.HANDOVER) 0.72f else 1f
        val light = Offset(centre.x - body * 0.32f + (sin(t * 0.23) * body * 0.07).toFloat(), centre.y - body * 0.44f + (cos(t * 0.19) * body * 0.06).toFloat())
        val core = if (step >= 2) Color(0xFF0B1F27) else BrandInk
        drawCircle(Brush.radialGradient(listOf(BrandMint, BrandGreen, core, core), light, body * 1.55f), body, centre, alpha = bodyAlpha)
        drawCircle(Brush.radialGradient(0f to Color.Transparent, (0.70f + step * 0.055f) to Color.Transparent, 1f to Color.White.copy(alpha = 0.55f), center = centre, radius = body), body, centre, alpha = bodyAlpha)
        drawCircle(Brush.radialGradient(listOf(Color.White.copy(alpha = 0.55f), Color.Transparent), Offset(centre.x - body * 0.32f, centre.y - body * 0.40f), body * 0.32f), body * 0.32f, Offset(centre.x - body * 0.32f, centre.y - body * 0.40f), alpha = bodyAlpha)
        drawCircle(BrandLime.copy(alpha = 0.9f), body * 0.06f, Offset(centre.x - body * 0.36f, centre.y - body * 0.44f), alpha = bodyAlpha)

        // Twenty-six particles on a flattened plane; quicker and limier while Thinking.
        val quick = if (pulse == Pulse.THINKING) 2.4 else 1.0
        val limeEvery = if (pulse == Pulse.THINKING) 2 else 5
        for (index in 0 until 26) {
            val seed = index.toDouble()
            val drift = (0.05 + (seed % 5) * 0.011) * quick
            val angle = seed * 2.39996 + t * drift
            val orbit = (0.335 + ((seed * 0.37) % 1) * 0.19) * (1 + heard * 0.08)
            val wobble = sin(t * (0.6 + heard * 5) + seed) * extent * (0.012 + heard * 0.03)
            val reach = extent * orbit + wobble
            val dx = (cos(angle) * reach).toFloat()
            val dy = (sin(angle) * reach * 0.62).toFloat()
            if (dy < 0 && kotlin.math.hypot(dx, dy) < body) continue
            val twinkle = 0.30 + 0.42 * (0.5 + 0.5 * sin(t * (1.1 + (seed % 3) * 0.4) + seed * 1.7))
            val dot = (extent * (0.006 + ((seed * 0.11) % 1) * 0.008) * (1 + heard * 0.5)).toFloat()
            drawCircle((if (index % limeEvery == 0) BrandLime else BrandMint).copy(alpha = min(1.0, twinkle * 0.62 * (1 + heard * 0.6)).toFloat()), dot / 2, Offset(centre.x + dx, centre.y + dy))
        }

        // The ripple, only while there is a level — which is only while the microphone is open.
        if (heard > 0.01f) {
            val surface = Path()
            for (s in 0..120) {
                val theta = s / 120.0 * 2 * PI
                val ripple = 0.035 * sin(5 * theta + t * 7) + 0.025 * sin(3 * theta - t * 4.3) + 0.015 * sin(9 * theta + t * 11)
                val r = body * (1.015 + heard * ripple)
                val x = centre.x + (cos(theta) * r).toFloat()
                val y = centre.y + (sin(theta) * r).toFloat()
                if (s == 0) surface.moveTo(x, y) else surface.lineTo(x, y)
            }
            surface.close()
            val line = max(1f, extent * 0.004f)
            drawPath(surface, BrandMint.copy(alpha = min(1f, heard * 0.9f)), style = Stroke(line))
            for (ring in 0 until 3) {
                val phase = ((t * 0.8 + ring / 3.0) % 1).toFloat()
                drawCircle(BrandMint.copy(alpha = heard * (1 - phase) * 0.6f), body * (1.06f + phase * 0.5f), centre, style = Stroke(line))
            }
        }
    }
}

