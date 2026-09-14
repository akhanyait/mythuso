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
import androidx.annotation.RequiresApi
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import za.co.mythuso.model.GilbertData

/* Gilbert's ears on Android, and the only file in this app allowed to have any.
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
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
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
