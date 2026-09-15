package za.co.mythuso.ui

import android.content.Context
import android.graphics.Paint
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import android.print.pdf.PrintedPdfDocument
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import java.io.FileOutputStream
import za.co.mythuso.model.EmergencyCardTerms
import za.co.mythuso.model.PassportSharing
import za.co.mythuso.model.PassportSharingData
import za.co.mythuso.model.QrCode
import za.co.mythuso.model.Scheduling

/* Two screens of the Health Passport's P1 on Android: the emergency card, and who opened the record.
 *
 * Ported from apps/web/src/features/PassportSharing.tsx. Every word is PassportSharingData's, generated from
 * packages/catalog/passport-sharing.json and the gateway's own sentences, and every end and number of opens is a
 * generated default worked out by model/PassportSharing.kt — no screen here types how long a card lasts or how
 * often it opens. Each screen says it is a preview before anything else, because a card with a QR code on it is
 * exactly the thing somebody could mistake for the real one.
 *
 * THE QR CODE is drawn by model/QrCode.kt, a port of the web's encoder with no dependency, held to codes an
 * independent decoder read back. PRINTING goes through the framework's PrintManager with a PDF drawn on its own
 * canvas — no embedded browser, which this app never uses, and no print library.
 */

private fun cardEndsSaid(card: EmergencyCardTerms) = PassportSharing.fill(PassportSharingData.Card.ENDS, mapOf("when" to Scheduling.longDate(card.endsOn)))
private fun cardOpensSaid(card: EmergencyCardTerms) = PassportSharing.fill(PassportSharingData.Card.OPENS, mapOf("uses" to card.usesAllowed.toString()))
private val opensOnlySaid get() = PassportSharing.fill(PassportSharingData.Card.OPENS_ONLY, mapOf("categories" to PassportSharingData.emergencySummaryNames.joinToString(", ")))

/* ---- The emergency card ---------------------------------------------------------------------------- */

@Composable fun EmergencyCardScreen(open: (String) -> Unit) {
    var card by remember { mutableStateOf<EmergencyCardTerms?>(null) }
    val context = LocalContext.current
    ScreenColumn {
        Heading(PassportSharingData.Card.EYEBROW, PassportSharingData.Card.TITLE, PassportSharingData.Card.INTRO)
        Note(PassportSharingData.Card.PREVIEW)
        val current = card
        if (current == null) {
            CareCard {
                Text(
                    PassportSharing.fill(PassportSharingData.Card.RIDES_ON, mapOf(
                        "recipient" to PassportSharingData.CARD_RECIPIENT,
                        "when" to Scheduling.longDate(Scheduling.today().plusDays(PassportSharingData.CARD_GRANT_ENDS_IN_DAYS.toLong()))
                    )),
                    style = MaterialTheme.typography.bodyMedium, color = Charcoal
                )
                Text(opensOnlySaid, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
                Text(PassportSharingData.SETTINGS_NOTE, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
            }
            PrimaryAction(PassportSharingData.Card.MAKE) { card = PassportSharing.makeCard(Scheduling.today()) }
        } else {
            CareCard(padding = ThusoSpacing.space16) {
                Text(PassportSharingData.Card.TITLE, style = MaterialTheme.typography.titleMedium, color = Charcoal, modifier = Modifier.semantics { heading() })
                SChip(PassportSharingData.Card.PREVIEW.substringBefore('.'), flagged = true)
                Text(PassportSharingData.Card.PREVIEW, style = MaterialTheme.typography.bodySmall, color = Charcoal)
                QrImage(current.payload)
                Text(PassportSharingData.Card.CODE, style = MaterialTheme.typography.labelMedium, color = StudioInkMuted)
                Text(current.code, style = MaterialTheme.typography.titleLarge, color = Charcoal)
                Text(opensOnlySaid, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                Text(PassportSharingData.Card.SEALED_NEVER, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
                Text(cardEndsSaid(current), style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                Text(cardOpensSaid(current), style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
                Text(
                    PassportSharing.fill(PassportSharingData.Card.RIDES_ON, mapOf("recipient" to current.recipient, "when" to Scheduling.longDate(current.grantEndsOn))),
                    style = MaterialTheme.typography.bodySmall, color = StudioInkMuted
                )
            }
            OutlinedButton(
                onClick = { printCard(context, current) },
                Modifier.fillMaxWidth().heightIn(min = TouchTarget), shape = ThusoButtonShape
            ) { Text(PassportSharingData.Card.PRINT) }
        }
        OutlinedButton(
            onClick = { open(PassportSharingData.Log.TITLE_ROUTE) },
            Modifier.fillMaxWidth().heightIn(min = TouchTarget), shape = ThusoButtonShape
        ) { Text(PassportSharingData.Log.TITLE) }
    }
}

/* The code as square modules on a white ground with the standard's quiet zone, named once for a screen reader. */
@Composable private fun QrImage(payload: String) {
    val code = remember(payload) { QrCode.encode(payload) }
    Canvas(
        Modifier.fillMaxWidth(0.62f).aspectRatio(1f).semantics { contentDescription = PassportSharingData.Card.QR_LABEL }
    ) {
        val extent = code.size + QrCode.QUIET_ZONE * 2
        val cell = size.minDimension / extent
        drawRect(Color.White)
        for (y in 0 until code.size) for (x in 0 until code.size) {
            if (code.isDark(x, y)) drawRect(Color.Black, topLeft = Offset((x + QrCode.QUIET_ZONE) * cell, (y + QrCode.QUIET_ZONE) * cell), size = Size(cell + 0.5f, cell + 0.5f))
        }
    }
}

/* One page: the preview sentence first, the code, the card's code and what it opens. Drawn on the PDF's own canvas,
   so what is printed is exactly what the contract says and nothing a renderer chose. */
private fun printCard(context: Context, card: EmergencyCardTerms) {
    val manager = context.getSystemService(Context.PRINT_SERVICE) as? PrintManager ?: return
    manager.print(PassportSharingData.Card.TITLE, object : PrintDocumentAdapter() {
        private var attributes: PrintAttributes? = null
        override fun onLayout(old: PrintAttributes?, new: PrintAttributes, cancel: CancellationSignal?, callback: LayoutResultCallback, extras: Bundle?) {
            attributes = new
            if (cancel?.isCanceled == true) { callback.onLayoutCancelled(); return }
            callback.onLayoutFinished(PrintDocumentInfo.Builder("emergency-card.pdf").setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).setPageCount(1).build(), old != new)
        }
        override fun onWrite(pages: Array<out PageRange>?, destination: ParcelFileDescriptor, cancel: CancellationSignal?, callback: WriteResultCallback) {
            val document = PrintedPdfDocument(context, attributes ?: PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build())
            val page = document.startPage(0)
            val canvas = page.canvas
            val text = Paint().apply { color = android.graphics.Color.BLACK; textSize = 11f; isAntiAlias = true }
            val left = 36f
            var y = 48f
            fun line(words: String, bold: Boolean = false) {
                text.isFakeBoldText = bold
                words.chunked(88).forEach { chunk -> canvas.drawText(chunk, left, y, text); y += 16f }
            }
            line(PassportSharingData.Card.TITLE, bold = true)
            line(PassportSharingData.Card.PREVIEW)
            y += 8f
            val code = QrCode.encode(card.payload)
            val cell = 180f / (code.size + QrCode.QUIET_ZONE * 2)
            val dark = Paint().apply { color = android.graphics.Color.BLACK }
            for (row in 0 until code.size) for (column in 0 until code.size) {
                if (code.isDark(column, row)) {
                    val x = left + (column + QrCode.QUIET_ZONE) * cell
                    val top = y + (row + QrCode.QUIET_ZONE) * cell
                    canvas.drawRect(x, top, x + cell, top + cell, dark)
                }
            }
            y += 196f
            line("${PassportSharingData.Card.CODE}: ${card.code}", bold = true)
            line(opensOnlySaid)
            line(PassportSharingData.Card.SEALED_NEVER)
            line(cardEndsSaid(card))
            line(cardOpensSaid(card))
            document.finishPage(page)
            try {
                FileOutputStream(destination.fileDescriptor).use { document.writeTo(it) }
                callback.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
            } catch (failure: java.io.IOException) {
                callback.onWriteFailed(failure.message)
            } finally {
                document.close()
            }
        }
    }, null)
}

/* ---- Who opened the record -------------------------------------------------------------------------- */

@Composable fun PassportAccessLogScreen(open: (String) -> Unit) {
    ScreenColumn {
        Heading(PassportSharingData.Log.EYEBROW, PassportSharingData.Log.TITLE, PassportSharingData.Log.INTRO)
        Note(PassportSharingData.Log.PREVIEW)
        Text(PassportSharingData.Log.CHAIN, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
        Text(PassportSharingData.Log.NEWEST, style = MaterialTheme.typography.titleMedium, color = Charcoal, modifier = Modifier.semantics { heading() })
        val entries = PassportSharing.log
        if (entries.isEmpty()) Text(PassportSharingData.Log.EMPTY, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
        entries.forEach { entry ->
            CareCard(padding = ThusoSpacing.space16) {
                Text(entry.action, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
                    SChip(entry.outcomeLabel, flagged = entry.outcome != "granted")
                    if (entry.breakGlass) SChip(PassportSharingData.Log.BREAK_GLASS, flagged = true)
                }
                val purpose = entry.purpose?.let { " · " + PassportSharing.fill(PassportSharingData.Log.PURPOSE, mapOf("purpose" to it)) } ?: ""
                Text("${entry.who} · ${Scheduling.longDate(Scheduling.today().plusDays(entry.dayOffset.toLong()))} · ${entry.time}$purpose", style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
                Text(entry.reason, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                entry.reviewDueInHours?.let { hours ->
                    val due = Scheduling.today().plusDays(entry.dayOffset.toLong()).plusDays(Math.ceil(hours / 24.0).toLong())
                    Text(PassportSharing.fill(PassportSharingData.Log.REVIEW_DUE, mapOf("when" to Scheduling.longDate(due))), style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
                }
            }
        }
        OutlinedButton(
            onClick = { open(PassportSharingData.Card.TITLE_ROUTE) },
            Modifier.fillMaxWidth().heightIn(min = TouchTarget), shape = ThusoButtonShape
        ) { Text(PassportSharingData.Card.TITLE) }
    }
}
