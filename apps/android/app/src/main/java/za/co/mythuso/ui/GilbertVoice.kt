package za.co.mythuso.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.annotation.RequiresApi
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import za.co.mythuso.model.GilbertData
import za.co.mythuso.model.GilbertSpokenLanguage
import java.util.Locale

/* GilbertOne's ears on Android, and — since 21 September 2026 — its mouth too: the only file in this
 * app allowed to have either. GilbertListener is the ears; GilbertSpeaker, at the foot of this file, is
 * the mouth. One file for both is the same rule as one file for the microphone: anybody asking when
 * this app can hear or speak gets an answer by opening a single module, and the build refuses
 * TextToSpeech everywhere else the way it already refuses SpeechRecognizer.
 *
 * The founder decided on 14 September 2026 what listening may be in Release 1: push-to-talk, English,
 * recognised on the phone itself, nothing kept. The build refuses SpeechRecognizer, RecognitionListener
 * and RecognizerIntent in every other Kotlin file, refuses MediaRecorder and AudioRecord in all of them,
 * and fails if this one stops creating the on-device recogniser or stops asking whether it exists.
 *
 * ON-DEVICE OR NOT AT ALL. SpeechRecognizer.createSpeechRecognizer hands audio to whichever recognition
 * service the phone has, which is usually a server. createOnDeviceSpeechRecognizer exists from Android
 * 12 (API 31) and does not; below 12, or where isOnDeviceRecognitionAvailable says no, voice is
 * unavailable and the screen says so in the contract's words. Typing still works. Nothing falls back.
 * If the on-device recogniser has none of the contract's English locales, that is unavailable too.
 *
 * THE INDICATOR IS THE MICROPHONE. `phase` becomes LISTENING in onReadyForSpeech, which is the
 * recogniser saying the microphone is open, and leaves it at onEndOfSpeech, at Stop, at the contract's
 * limit, on an error or on cancel. Between the tap and onReadyForSpeech the phase is OPENING, which draws
 * nothing that looks like listening. No timer stands in for the microphone.
 *
 * NO AUDIO IS KEPT. onBufferReceived is ignored. onRmsChanged gives one loudness number, which drives
 * the sphere while LISTENING and is reset when it ends; it is not stored or sent. The transcript is a
 * string here for one turn, handed to the screen to be corrected and sent, or discarded.
 *
 * PERMISSION ON FIRST USE. This object asks for nothing. The first tap without RECORD_AUDIO moves to
 * EXPLAINING, where the screen shows the contract's beforePermission sentence; only the screen's
 * Continue launches the system request, and a refusal is said in the contract's `refused` sentence. */
class GilbertListener(private val context: Context) : RecognitionListener {
    enum class Phase { IDLE, EXPLAINING, OPENING, LISTENING, FINISHING, HEARD, UNAVAILABLE, REFUSED, FAILED }

    var phase by mutableStateOf(Phase.IDLE)
        private set
    var captions by mutableStateOf("")
        private set
    var heard by mutableStateOf("")
        private set
    /** 0 to 1, and only ever non-zero while [phase] is LISTENING. */
    var level by mutableFloatStateOf(0f)
        private set

    val available: Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(context)

    private var recogniser: SpeechRecognizer? = null
    private var localeIndex = 0
    private val handler = Handler(Looper.getMainLooper())
    private val limit = Runnable { stop() }

    init { if (!available) phase = Phase.UNAVAILABLE }

    private fun permitted() = context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    /** A tap on the sphere or on Tap to talk. */
    fun talk() {
        if (!available) { phase = Phase.UNAVAILABLE; return }
        if (permitted()) begin() else phase = Phase.EXPLAINING
    }

    fun notNow() { phase = Phase.IDLE }

    /** The system's answer to the request the screen launched after the contract's explanation. */
    fun permissionAnswered(granted: Boolean) { if (granted) begin() else phase = Phase.REFUSED }

    /** Stop, pressed. The microphone closes now; the recogniser finishes what it heard. */
    fun stop() {
        if (phase != Phase.LISTENING && phase != Phase.OPENING) return
        handler.removeCallbacks(limit)
        recogniser?.stopListening()
        level = 0f
        phase = Phase.FINISHING
    }

    fun sent() = reset()
    fun discard() = reset()

    /** The sheet closed or the app left the foreground. Everything ends and nothing is kept. */
    fun cancel() {
        recogniser?.cancel()
        reset()
    }

    private fun begin() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) { phase = Phase.UNAVAILABLE; return }
        localeIndex = 0
        open()
    }

    @RequiresApi(Build.VERSION_CODES.S)
    private fun open() {
        destroy()
        val created = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
        created.setRecognitionListener(this)
        recogniser = created
        /* No recognition action on the intent. The on-device recogniser takes its parameters from the
           extras; an action is what would let the same intent start a recognition activity, which may be
           a server, and the build refuses the action by name everywhere. */
        val intent = Intent().apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, GilbertData.voice.recognitionLocales[localeIndex])
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
        }
        captions = ""
        heard = ""
        phase = Phase.OPENING
        created.startListening(intent)
        handler.removeCallbacks(limit)
        handler.postDelayed(limit, GilbertData.voice.maxListeningSeconds * 1000L)
    }

    private fun destroy() {
        recogniser?.destroy()
        recogniser = null
    }

    private fun reset() {
        handler.removeCallbacks(limit)
        destroy()
        captions = ""
        heard = ""
        level = 0f
        phase = if (available) Phase.IDLE else Phase.UNAVAILABLE
    }

    private fun finish(words: String) {
        handler.removeCallbacks(limit)
        destroy()
        level = 0f
        captions = ""
        heard = words.trim()
        phase = if (heard.isEmpty()) Phase.FAILED else Phase.HEARD
    }

    // RecognitionListener

    override fun onReadyForSpeech(params: Bundle?) { if (phase == Phase.OPENING) phase = Phase.LISTENING }
    override fun onBeginningOfSpeech() {}

    /* Roughly -2 to 10 dB from the recogniser, onto 0 to 1: quick to rise and slower to fall, so a
       syllable lands and a silence settles. */
    override fun onRmsChanged(rmsdB: Float) {
        if (phase != Phase.LISTENING) return
        val loudness = ((rmsdB + 2f) / 12f).coerceIn(0f, 1f)
        level += (loudness - level) * (if (loudness > level) 0.6f else 0.18f)
    }

    /* Deliberately empty: the audio the recogniser hands back is not kept, read or passed on. */
    override fun onBufferReceived(buffer: ByteArray?) {}

    override fun onEndOfSpeech() {
        if (phase == Phase.LISTENING) { level = 0f; phase = Phase.FINISHING }
    }

    override fun onError(error: Int) {
        if (phase != Phase.OPENING && phase != Phase.LISTENING && phase != Phase.FINISHING) return
        when (error) {
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> { reset(); phase = Phase.REFUSED }
            /* The on-device recogniser does not have this English locale. Try the contract's next one, and
               when none is left, voice is unavailable on this phone rather than sent somewhere that has it. */
            SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED, SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> {
                if (localeIndex + 1 < GilbertData.voice.recognitionLocales.size && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    localeIndex += 1
                    open()
                } else {
                    reset(); phase = Phase.UNAVAILABLE
                }
            }
            else -> finish(captions)
        }
    }

    override fun onResults(results: Bundle?) {
        finish(results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: captions)
    }

    override fun onPartialResults(partialResults: Bundle?) {
        partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let { captions = it }
    }

    override fun onEvent(eventType: Int, params: Bundle?) {}
}

/* GilbertOne's mouth, added 21 September 2026 under voice.nativeSpeech. Android's TextToSpeech is
 * on-device by default — the engine that already ships with the phone does the work, with no network
 * request behind it — so unlike SpeechRecognizer there is no separate on-device request to make:
 * onInit's status says whether an engine exists at all, and setLanguage says whether it has English.
 *
 * THE FLAG IS READ BEFORE ANYTHING ELSE. `speak` returns before touching the engine at all while
 * voice.nativeSpeech.enabled is false, the same order GilbertVoice.swift and lib/voice.ts both keep, so
 * switching the contract's flag off again leaves this class inert rather than merely unused.
 *
 * MUTE IS THE PHONE'S OWN CONTROL, WHICH THE WEB DOES NOT HAVE. A phone is far more often overheard
 * than a desktop browser at a settled address, so `muted` — false by default, matching voice.webSpeech's
 * own default of speaking — stops the current sentence immediately and every reply after it until
 * somebody taps the composer's speaker button back on. It is Compose state on this object alone: nothing
 * about the choice is written to SharedPreferences, DataStore or a file, so it resets the way the
 * composer's own microphone state does when the sheet is opened again.
 *
 * THE CAPTION NEVER DEPENDS ON THE VOICE. GilbertScreens.kt writes every reply to the screen whether or
 * not this class ever speaks a word of it; speaking is a second reading of words already there, never
 * the only place they appear — the same rule voice.webSpeech states for the web. */
class GilbertSpeaker(context: Context) : TextToSpeech.OnInitListener {
    enum class State { UNAVAILABLE, READY }

    var state by mutableStateOf(State.UNAVAILABLE)
        private set
    var speaking by mutableStateOf(false)
        private set
    /** Off is one tap away on the composer's speaker button; on is the default, matching voice.webSpeech. */
    var muted by mutableStateOf(false)

    private var engine: TextToSpeech? = TextToSpeech(context.applicationContext, this)
    private val utteranceId = "gilbertone-reply"

    override fun onInit(status: Int) {
        if (status != TextToSpeech.SUCCESS) { state = State.UNAVAILABLE; return }
        val result = engine?.setLanguage(preferredLocale())
        state = if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED)
            State.UNAVAILABLE else State.READY
        engine?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String?) { speaking = true }
            override fun onDone(id: String?) { speaking = false }
            @Suppress("DEPRECATION") override fun onError(id: String?) { speaking = false }
        })
    }

    /** voice.voicePreference's own order — South African English first, then British, then Australian,
     *  then any English voice — applied to whatever this engine actually has; an engine with none of the
     *  four keeps its own default locale, and none is promised. The same rule lib/voice.ts applies to the
     *  browser's voice list and GilbertVoice.swift to the phone's installed voices. A reply detected as
     *  one of voice.spokenLanguages is asked for in that language's own localeOrder first, and this order
     *  stands behind it. */
    private fun preferredLocale(language: GilbertSpokenLanguage? = null): Locale {
        val current = engine
        if (language != null) {
            for (tag in language.localeOrder) {
                val candidate = Locale.forLanguageTag(tag)
                val availability = current?.isLanguageAvailable(candidate) ?: TextToSpeech.LANG_NOT_SUPPORTED
                if (availability >= TextToSpeech.LANG_AVAILABLE) return candidate
            }
        }
        for (tag in GilbertData.voice.speechVoiceOrder) {
            val candidate = Locale.forLanguageTag(tag)
            val availability = current?.isLanguageAvailable(candidate) ?: TextToSpeech.LANG_NOT_SUPPORTED
            if (availability >= TextToSpeech.LANG_AVAILABLE) return candidate
        }
        return Locale.forLanguageTag(GilbertData.voice.recognitionLocales.first())
    }

    /** The reply's own words, already on the screen before this is ever called — never a substitute for
     *  them. A held safety face or a muted screen answers with silence rather than an utterance nobody
     *  asked to hear. */
    fun speak(text: String, language: GilbertSpokenLanguage? = null) {
        if (!GilbertData.voice.nativeSpeechEnabled || muted || state != State.READY) return
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return
        engine?.language = preferredLocale(language)
        engine?.speak(trimmed, TextToSpeech.QUEUE_FLUSH, null, utteranceId)
    }

    /** Stop, whether the composer's mute button, the sheet closing or the app leaving the foreground. */
    fun stop() {
        engine?.stop()
        speaking = false
    }

    /** The sheet is gone for good; the engine is released rather than left running for nobody. */
    fun shutdown() {
        engine?.stop()
        engine?.shutdown()
        engine = null
    }
}
