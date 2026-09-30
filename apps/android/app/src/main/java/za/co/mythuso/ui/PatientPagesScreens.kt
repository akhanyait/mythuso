package za.co.mythuso.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.LocalHospital
import androidx.compose.material.icons.outlined.PhoneAndroid
import androidx.compose.material.icons.outlined.Support
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import za.co.mythuso.model.CrisisLinesData
import za.co.mythuso.model.PatientPages
import za.co.mythuso.model.PatientPagesData
import za.co.mythuso.model.PatientPagesData.Activity as Moving
import za.co.mythuso.model.PatientPagesData.MentalHealth as Mental
import za.co.mythuso.model.PreviewStore
import za.co.mythuso.model.Wellbeing
import za.co.mythuso.ui.components.*

/* Mental health and Activity — two of the web's ten patient pages, the two the founder asked to have on
 * the phones. Ported from apps/web/src/features/PatientPages.tsx. Every word is PatientPagesData's,
 * generated from packages/catalog/patient-pages.json, or a line of a contract that file's derivations
 * name (the crisis lines, the journal's refusals), read through model/PatientPages.kt.
 *
 * WHAT THIS PHONE DOES NOT DRAW, AND WHY. There is no "Your health" hub here, so the pages are reached from
 * More beside Live well and the top bar's back is the way out; the web's "Back to Your health" is not
 * drawn because there is nothing for it to go back to. The other eight pages are web-only. On mental
 * health, the doors to the health library and to community support are not drawn — both are web pages,
 * no native screen exists for either, and a web view is refused in this app — and the catalogue button
 * gives way to the catalogue entry's own name and phase. model/PatientPages.kt decides each of those.
 *
 * THE REVIEW NOTICE IS UNDER THE HEADING, NOT AT THE FOOT. It qualifies every sentence on both pages, and
 * at font scale 2.0 the refusals panel at the bottom is several screens away. */

@OptIn(ExperimentalFoundationApi::class)
@Composable fun MentalHealthScreen(open: (String) -> Unit) {
    val crisisCard = remember { BringIntoViewRequester() }
    val scope = rememberCoroutineScope()
    ScreenColumn {
        Heading(Mental.eyebrow, Mental.heading, Mental.lead)
        ReviewNotice()

        /* The doors this phone has somewhere to send, as the app's own list rows. The crisis door stays on
           the page: it brings the crisis card into view, as the web's anchor does. */
        CareCard(padding = ThusoSpacing.space8) {
            val doors = PatientPages.mentalHealthDoors
            doors.forEachIndexed { index, door ->
                MenuRow(door.title, door.sub, doorIcon(door.id)) {
                    if (door.kind == "anchor") scope.launch { crisisCard.bringIntoView() }
                    else PatientPages.routeFor(door.target)?.let(open)
                }
                if (index < doors.lastIndex) HorizontalDivider(color = theme.border)
            }
        }

        /* THE ONE RAISED CARD ON THE PAGE, AND THE EMERGENCY SCREEN IS ITS FIRST CONTROL. A crisis line is
           added after the door to the ambulance and never stands in for it; the numbers of that screen are
           not restated here, because this page opens it rather than copying it. The lines are selectable so
           a person can copy one into the dialler themselves — nothing here dials, and the contract says so
           under them. */
        LeadCard(Modifier.bringIntoViewRequester(crisisCard)) {
            Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.Support, null, tint = theme.foreground, modifier = Modifier.size(22.dp))
                Text(Mental.Crisis.heading, style = MaterialTheme.typography.titleLarge, color = theme.foreground,
                     modifier = Modifier.semantics { heading() })
            }
            Text(Mental.Crisis.emergencyFirst, style = MaterialTheme.typography.bodyMedium, color = theme.foreground)
            PrimaryAction(Mental.Crisis.action, icon = Icons.Outlined.LocalHospital) {
                PatientPages.routeFor(Mental.Crisis.modal)?.let(open)
            }
            HorizontalDivider(color = theme.border)
            Text(CrisisLinesData.heading, style = MaterialTheme.typography.titleSmall, color = theme.foreground)
            SelectionContainer {
                Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space16)) {
                    CrisisLinesData.lines.forEach { line ->
                        /* One node for TalkBack, read once, with the number digit by digit — the line's own
                           spoken form, so "0800" is not read as eight hundred. */
                        Column(
                            Modifier.fillMaxWidth().clearAndSetSemantics {
                                contentDescription = "${line.name}, ${line.spoken}. ${PatientPages.whenToUse(line)}"
                            },
                            verticalArrangement = Arrangement.spacedBy(2.dp)
                        ) {
                            Text(line.name, style = MaterialTheme.typography.titleSmall, color = theme.foreground)
                            Text(line.number, style = MaterialTheme.typography.titleLarge, color = theme.primaryInk)
                            Text(PatientPages.whenToUse(line), style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
                        }
                    }
                }
            }
            Text(Mental.Crisis.nothingDials, style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
        }

        /* What the export drew and this page refuses: a session "Available now" and a row of mood faces.
           Each is a quiet panel saying why, in the place the drawing would have been.
           The catalogue entry is a bordered chip on the surface: the quiet tone is the muted fill, which is this panel's own
           ground, and would leave the words floating with nothing to say they are one catalogue row. */
        RefusedPanel(Mental.Session.heading) {
            Text(Mental.Session.detail, style = MaterialTheme.typography.bodyMedium, color = theme.foreground)
            if (PatientPages.sessionActionDrawn) ThusoButton(
                Mental.Session.action, onClick = { PatientPages.catalogueRoute?.let(open) },
                variant = ThusoButtonVariant.Secondary, trailingIcon = Icons.AutoMirrored.Outlined.ArrowForward
            ) else StatusPill(Mental.Session.catalogueEntry, "plain")
        }
        RefusedPanel(Mental.Mood.heading) {
            Text(PatientPages.moodRefusal, style = MaterialTheme.typography.bodyMedium, color = theme.foreground)
            Text(Mental.Mood.why, style = MaterialTheme.typography.bodyMedium, color = theme.mutedForeground)
        }

        PageRefusals()
    }
}

@Composable fun ActivityScreen(store: PreviewStore, open: (String) -> Unit) {
    /* The rows and the count come from one call, so the figure is the list's own length and nothing else. */
    val moving = PatientPages.moving(store.wellbeing)
    ScreenColumn {
        DemoBadge()
        Heading(Moving.eyebrow, Moving.heading, Moving.lead)
        ReviewNotice()

        /* The export's three figures keep their places and say what is true. Rows rather than three boxes
           across: two of the three are "Not measured", and three equal boxes would give a sentence the
           weight of a number. The values sit in one column at the trailing edge, so the one count lines up
           with the two written states rather than shouting over them. */
        CareCard(padding = ThusoSpacing.space16) {
            Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8), verticalAlignment = Alignment.Top) {
                Icon(Icons.Outlined.Block, null, tint = theme.mutedForeground, modifier = Modifier.padding(top = 2.dp).size(18.dp))
                Text(PatientPages.noDevice, style = MaterialTheme.typography.bodyMedium, color = theme.foreground)
            }
            HorizontalDivider(color = theme.border)
            Moving.tiles.forEachIndexed { index, tile ->
                TileRow(tile.label, PatientPages.tileValue(tile, moving.size), tile.detail)
                if (index < Moving.tiles.lastIndex) HorizontalDivider(color = theme.border)
            }
        }

        Section(Moving.entriesHeading) {
            if (moving.isEmpty()) EmptyStateCard(Moving.emptyTitle, Moving.emptyDetail)
            else CareCard(padding = ThusoSpacing.space12) {
                moving.forEachIndexed { index, entry ->
                    Column(
                        Modifier.fillMaxWidth().padding(vertical = ThusoSpacing.space4).semantics(mergeDescendants = true) {},
                        verticalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        Text(Wellbeing.day(entry.dayOffset), style = MaterialTheme.typography.labelMedium, color = theme.mutedForeground)
                        Text(entry.text, style = MaterialTheme.typography.bodyMedium, color = theme.foreground)
                    }
                    if (index < moving.lastIndex) HorizontalDivider(color = theme.border)
                }
            }
            /* Writing is the one thing that fills this page, so it is the page's one primary action. */
            Moving.actions.forEach { action ->
                PatientPages.routeFor(action.target)?.let { route -> PrimaryAction(action.label) { open(route) } }
            }
        }

        /* In place of the export's "synced 5 minutes ago": the door to where a request to link the phone's
           health store is recorded. Nothing is read from it. */
        CareCard(padding = ThusoSpacing.space16) {
            Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12), verticalAlignment = Alignment.Top) {
                TileIcon(Icons.Outlined.PhoneAndroid, background = theme.muted)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                    Text(Moving.Wearable.heading, style = MaterialTheme.typography.titleMedium, color = theme.foreground,
                         modifier = Modifier.semantics { heading() })
                    Text(Moving.Wearable.detail, style = MaterialTheme.typography.bodyMedium, color = theme.mutedForeground)
                }
            }
            PatientPages.routeFor(Moving.Wearable.target)?.let { route ->
                ThusoButton(
                    Moving.Wearable.action, onClick = { open(route) }, variant = ThusoButtonVariant.Secondary,
                    trailingIcon = Icons.AutoMirrored.Outlined.ArrowForward, modifier = Modifier.fillMaxWidth()
                )
            }
        }

        PageRefusals()
    }
}

/* ---- The frame both pages share --------------------------------------------------------------------- */

/* The contract's review notice, under its own heading from the aside. */
@Composable private fun ReviewNotice() {
    ThusoAlert(PatientPagesData.Aside.reviewHeading) { ThusoAlertText(PatientPagesData.Review.notice) }
}

/* The four sentences that qualify every page, at the foot, as the web's aside is on a phone. */
@Composable private fun PageRefusals() {
    CareCard(padding = ThusoSpacing.space20) {
        Text(PatientPagesData.Aside.refusalsHeading, style = MaterialTheme.typography.titleLarge, color = theme.foreground,
             modifier = Modifier.semantics { heading() })
        Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
            PatientPagesData.refusals.forEach { sentence ->
                Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12), verticalAlignment = Alignment.Top) {
                    Icon(Icons.Outlined.Block, null, Modifier.padding(top = 2.dp).size(18.dp), tint = theme.mutedForeground)
                    Text(sentence, style = MaterialTheme.typography.bodyMedium, color = theme.foreground)
                }
            }
        }
    }
}

/* A thing the export drew and this page will not: the muted panel, a refusal mark beside the heading. */
@Composable private fun RefusedPanel(heading: String, content: @Composable ColumnScope.() -> Unit) {
    TonedCard(padding = ThusoSpacing.space16) {
        Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8), verticalAlignment = Alignment.Top) {
            Icon(Icons.Outlined.Block, null, tint = theme.foreground, modifier = Modifier.padding(top = 2.dp).size(18.dp))
            Text(heading, style = MaterialTheme.typography.titleMedium, color = theme.foreground,
                 modifier = Modifier.semantics { heading() })
        }
        content()
    }
}

/* A tile as a row: what it is and why on the leading side, the value in the trailing column. Once the
   reader has enlarged the type the value goes under the label instead — at twice the type "Not measured"
   beside a sentence leaves the sentence a column two words wide. One node for TalkBack, read once. */
@Composable private fun TileRow(label: String, value: String, detail: String) {
    val roomy = LocalDensity.current.fontScale < 1.3f
    val spoken = Modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = "$label: $value. $detail" }
    val words: @Composable ColumnScope.() -> Unit = {
        Text(label, style = MaterialTheme.typography.titleSmall, color = theme.foreground)
        Text(detail, style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
    }
    if (roomy) Row(spoken, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space16), verticalAlignment = Alignment.Top) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp), content = words)
        Text(value, style = MaterialTheme.typography.titleMedium, color = theme.foreground, textAlign = TextAlign.End)
    } else Column(spoken, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        words()
        Text(value, style = MaterialTheme.typography.titleMedium, color = theme.foreground)
    }
}

/* A picture, not a sentence, so it lives with the screen; a door the contract adds later draws the
   generic mark rather than nothing. */
private fun doorIcon(id: String): ImageVector = when (id) {
    "journal" -> Icons.Outlined.EditNote
    "crisis" -> Icons.Outlined.LocalHospital
    else -> Icons.AutoMirrored.Outlined.ArrowForward
}
