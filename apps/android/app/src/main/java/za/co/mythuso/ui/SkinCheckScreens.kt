package za.co.mythuso.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.CameraAlt
import androidx.compose.material.icons.outlined.PhotoLibrary
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.SkinCheck
import za.co.mythuso.model.SkinCheckData
import za.co.mythuso.model.SkinFirstAidEntry
import za.co.mythuso.model.SkinOutcome
import za.co.mythuso.model.SkinQuestion
import za.co.mythuso.ui.components.ThusoButton
import za.co.mythuso.ui.components.ThusoButtonVariant
import za.co.mythuso.ui.components.ThusoCard

/* Show GilbertOne a rash, on Android — ported from apps/web/src/features/SkinCheck.tsx and opened from
 * GilbertOne's suggestions (GilbertScreens.kt) over the conversation.
 *
 * THE PHOTO comes from the system photo picker or the camera's own preview capture. Neither needs a
 * permission and none is declared: the picker runs outside the app, and TakePicturePreview hands back a
 * small picture in memory and writes no file anywhere, so there is no temporary file to clean up. A
 * picked photo is read from its content address into memory, checked against the panel's attachment
 * limit and decoded; nothing is copied, saved, sent or read for meaning. Removing it, ending the check,
 * closing the screen or an emergency all let it go.
 *
 * THE ANSWERS reach an outcome only through SkinCheck.outcome, the arithmetic every platform shares by
 * fixture. A pressed sign that raises an emergency rule, or typed words the emergency terms raise, hand
 * the words to the conversation at once (onEmergency): its own emergency answer is the one she reads.
 * Every sentence here is SkinCheckData's or a knowledge entry's, generated from the contract. */

@Composable fun SkinCheckScreen(onEmergency: (String) -> Unit, onBack: () -> Unit) {
    val context = LocalContext.current
    var answers by remember { mutableStateOf<Map<String, List<String>>>(emptyMap()) }
    var typed by remember { mutableStateOf("") }
    var photo by remember { mutableStateOf<Bitmap?>(null) }
    var problem by remember { mutableStateOf("") }
    var outcome by remember { mutableStateOf<SkinOutcome?>(null) }
    var ended by remember { mutableStateOf(false) }
    var copied by remember { mutableStateOf(false) }
    DisposableEffect(Unit) { onDispose { photo = null } }

    val choose = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) {
            val (image, why) = loadPhoto(context, uri)
            problem = why
            if (image != null) photo = image
        }
    }
    val take = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { image ->
        if (image != null) { problem = ""; photo = image }
    }
    fun handOver(words: String) { photo = null; onEmergency(words) }
    fun press(questionId: String, optionId: String) {
        val next = SkinCheck.press(answers, questionId, optionId)
        val now = SkinCheck.outcome(next)
        if (now is SkinOutcome.Emergency) { handOver(now.says); return }
        answers = next; outcome = null; copied = false
    }
    val shown = outcome is SkinOutcome.SisterToday || outcome is SkinOutcome.Information

    Column(
        Modifier.fillMaxSize().background(theme.background).verticalScroll(rememberScrollState())
            .padding(horizontal = ThusoSpacing.space20, vertical = ThusoSpacing.space16),
        verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space16)
    ) {
        ThusoButton(SkinCheckData.Screen.backLabel, onClick = { photo = null; onBack() }, variant = ThusoButtonVariant.Ghost, leadingIcon = Icons.AutoMirrored.Filled.ArrowBack)
        Text(SkinCheckData.Screen.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold, color = theme.foreground, modifier = Modifier.semantics { heading() })
        SkPara(SkinCheckData.Screen.lead)
        SkinCheckData.whatItIsNot.forEach { SkBullet(it) }
        SkNote(SkinCheck.reviewSentence)
        if (ended) {
            SkNote(SkinCheckData.Screen.ended)
            return@Column
        }
        ThusoCard(gap = ThusoSpacing.space8) {
            ThusoButton(SkinCheckData.Photo.takeLabel, onClick = { take.launch(null) }, variant = ThusoButtonVariant.Secondary, leadingIcon = Icons.Outlined.CameraAlt, modifier = Modifier.fillMaxWidth())
            ThusoButton(if (photo == null) SkinCheckData.Photo.chooseLabel else SkinCheckData.Photo.replaceLabel,
                onClick = { choose.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                variant = ThusoButtonVariant.Secondary, leadingIcon = Icons.Outlined.PhotoLibrary, modifier = Modifier.fillMaxWidth())
            if (problem.isNotEmpty()) SkPara(problem)
            photo?.let { image ->
                Image(image.asImageBitmap(), contentDescription = SkinCheckData.Photo.alt, contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxWidth().heightIn(max = 240.dp).clip(RoundedCornerShape(ThusoRadius.control)))
                ThusoButton(SkinCheckData.Photo.removeLabel, onClick = { photo = null }, variant = ThusoButtonVariant.Ghost)
            }
            SkNote(SkinCheckData.Photo.held)
            SkNote(SkinCheckData.Photo.noReader)
            SkNote(SkinCheckData.Photo.videoRefused)
        }
        if (!shown) SkinCheckData.questions.forEach { question ->
            SkQuestionCard(question, answers[question.id] ?: emptyList(), typed, { typed = it }) { press(question.id, it) }
        }
        when (val now = outcome) {
            is SkinOutcome.Incomplete -> SkPara(SkinCheckData.Screen.missing, strong = true)
            is SkinOutcome.SisterToday -> SkSisterToday(now)
            is SkinOutcome.Information -> SkInformation(now)
            else -> Unit
        }
        if (shown) {
            val lines = SkinCheck.summary(answers, typed, photo != null)
            ThusoCard(gap = ThusoSpacing.space8) {
                Text(SkinCheckData.Summary.title, style = MaterialTheme.typography.titleMedium, color = theme.foreground, modifier = Modifier.semantics { heading() })
                lines.forEach { SkBullet(it) }
                ThusoButton(if (copied) SkinCheckData.Summary.copiedLabel else SkinCheckData.Summary.copyLabel, onClick = {
                    /* The clipboard is the person's own; the app keeps nothing and sends nothing. */
                    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    clipboard.setPrimaryClip(ClipData.newPlainText(SkinCheckData.Summary.title, (listOf(SkinCheckData.Summary.title) + lines).joinToString("\n")))
                    copied = true
                }, variant = ThusoButtonVariant.Secondary)
                SkNote("${SkinCheckData.Summary.sendLead} ${SkinCheckData.Summary.sendRefusal}")
            }
            ThusoButton(SkinCheckData.Screen.changeLabel, onClick = { outcome = null }, variant = ThusoButtonVariant.Secondary, modifier = Modifier.fillMaxWidth())
        } else {
            ThusoButton(SkinCheckData.Screen.seeLabel, onClick = {
                val now = SkinCheck.outcome(answers, typed)
                if (now is SkinOutcome.Emergency) handOver(now.says) else outcome = now
            }, modifier = Modifier.fillMaxWidth())
        }
        ThusoButton(SkinCheckData.Screen.endLabel, onClick = {
            photo = null; answers = emptyMap(); typed = ""; outcome = null; problem = ""; ended = true
        }, variant = ThusoButtonVariant.Ghost, modifier = Modifier.fillMaxWidth())
        SkNote(SkinCheckData.photoReading)
    }
}

/* A picked photo, read into memory and decoded, or the contract's sentence for why it was not taken.
   Read to one byte past the limit and no further, so a very large file is refused without being held. */
private fun loadPhoto(context: Context, uri: Uri): Pair<Bitmap?, String> {
    val bytes = context.contentResolver.openInputStream(uri)?.use { stream ->
        val out = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(64 * 1024)
        while (out.size() <= SkinCheckData.Photo.limitBytes) {
            val read = stream.read(buffer)
            if (read < 0) break
            out.write(buffer, 0, read)
        }
        out.toByteArray()
    } ?: return null to SkinCheckData.Photo.notImage
    if (bytes.size > SkinCheckData.Photo.limitBytes) return null to SkinCheckData.Photo.tooLarge
    val image = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null to SkinCheckData.Photo.notImage
    return image to ""
}

@Composable private fun SkQuestionCard(question: SkinQuestion, chosen: List<String>, typed: String, onTyped: (String) -> Unit, press: (String) -> Unit) {
    ThusoCard(gap = ThusoSpacing.space8) {
        Text(question.ask, style = MaterialTheme.typography.titleMedium, color = theme.foreground, modifier = Modifier.semantics { heading() })
        if (question.kind == "multi") SkNote(SkinCheckData.Screen.multiHint)
        if (question.kind == "text") {
            SkNote(SkinCheckData.Screen.textHint)
            OutlinedTextField(typed, onTyped, modifier = Modifier.fillMaxWidth().semantics { contentDescription = question.ask },
                minLines = 2, maxLines = 6, colors = za.co.mythuso.ui.components.thusoFieldColours())
        } else question.options.forEach { option ->
            val on = option.id in chosen
            val urgent = question.id == "signs" && option.id != question.exclusive
            OutlinedButton(
                onClick = { press(option.id) },
                modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget).semantics { selected = on },
                shape = RoundedCornerShape(ThusoRadius.control),
                border = BorderStroke(if (on || urgent) 2.dp else 1.dp, if (on) theme.primary else if (urgent) theme.dangerInk else theme.border),
                colors = ButtonDefaults.outlinedButtonColors(containerColor = if (on) theme.muted else theme.surface, contentColor = theme.foreground)
            ) {
                Text(option.label, modifier = Modifier.fillMaxWidth(), fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal)
            }
        }
    }
}

@Composable private fun SkSisterToday(now: SkinOutcome.SisterToday) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(ThusoRadius.card)).background(theme.surface)
            .padding(ThusoSpacing.space16),
        verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)
    ) {
        Text(SkinCheckData.SisterToday.headline, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold, color = theme.dangerInk, modifier = Modifier.semantics { heading() })
        SkPara(SkinCheckData.SisterToday.lead)
        now.rules.forEach { rule ->
            SkLabel(SkinCheckData.SisterToday.becauseLabel)
            SkPara(rule.says, strong = true)
            if (rule.guidance.isNotEmpty()) SkLabel(SkinCheckData.SisterToday.guidanceLabel)
            rule.guidance.forEach { g ->
                SkPara(g.title, strong = true)
                SkPara(g.line)
                SkNote(SkinCheck.entryNote(g.source, g.reviewedBy))
            }
        }
        SkPara(SkinCheckData.SisterToday.arrange)
        SkPara(SkinCheckData.SisterToday.worse, strong = true)
    }
}

@Composable private fun SkInformation(now: SkinOutcome.Information) {
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
        Text(SkinCheckData.Information.headline, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold, color = theme.foreground, modifier = Modifier.semantics { heading() })
        if (now.checkFirst.isNotEmpty()) {
            SkLabel(SkinCheckData.Information.checkFirstHeading)
            now.checkFirst.forEach { SkFirstAidCard(it) }
        }
        if (now.conditions.isEmpty()) SkPara("${SkinCheckData.Information.noneMatched} ${SkinCheckData.Information.onlyAClinician}")
        else {
            SkPara(SkinCheckData.Information.lead)
            SkPara(SkinCheckData.Information.onlyAClinician, strong = true)
            now.conditions.forEach { entry ->
                ThusoCard(gap = ThusoSpacing.space8) {
                    SkPara(entry.title, strong = true)
                    SkLabel(SkinCheckData.Information.looksLabel)
                    entry.looks.forEach { SkBullet(it) }
                    SkLabel(SkinCheckData.Information.whenLabel)
                    SkPara(entry.`when`)
                    SkNote(SkinCheck.entryNote(entry.source, entry.reviewedBy))
                }
            }
        }
        SkLabel(SkinCheckData.Information.selfCareHeading)
        SkNote(SkinCheckData.Information.selfCareLead)
        now.selfCare.forEach { SkFirstAidCard(it) }
    }
}

@Composable private fun SkFirstAidCard(aid: SkinFirstAidEntry) {
    ThusoCard(gap = ThusoSpacing.space8) {
        SkPara(aid.title, strong = true)
        aid.steps.forEachIndexed { index, step -> SkPara("${index + 1}. $step") }
        SkLabel(SkinCheckData.Information.warningsLabel)
        aid.warnings.forEach { SkBullet(it) }
        SkLabel(SkinCheckData.Information.whenToCallLabel)
        SkPara(aid.whenToCall)
        SkNote(SkinCheck.entryNote(aid.source, aid.reviewedBy))
    }
}

@Composable private fun SkPara(text: String, strong: Boolean = false) {
    Text(text, style = MaterialTheme.typography.bodyLarge, fontWeight = if (strong) FontWeight.SemiBold else FontWeight.Normal, color = theme.foreground)
}
@Composable private fun SkNote(text: String) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
}
@Composable private fun SkLabel(text: String) {
    Text(text, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = theme.foreground)
}
@Composable private fun SkBullet(text: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
        Text("•", color = theme.foreground)
        Text(text, style = MaterialTheme.typography.bodyLarge, color = theme.foreground)
    }
}
