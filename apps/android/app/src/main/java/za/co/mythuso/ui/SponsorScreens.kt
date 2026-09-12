package za.co.mythuso.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.*

/*
 * What you are paying for, and what paying for it does not buy you.
 *
 * “Sponsored care” has been a word under a family member's name since the family screens were
 * written, and there has never been anything behind it. The back office could see a sponsor's
 * statement — ProgrammesScreen renders it for an administrator — and the person actually paying
 * could not see what they had bought, what was left, or, the part this screen exists for, where the
 * line is between the two.
 *
 * The design decision worth defending is that the refusal is not a footnote. Two lists, equal
 * weight, one after the other: what you see, and what you never see. A screen that lists the three
 * things a sponsor is shown and then mentions in grey underneath that the clinical record is off
 * limits has ordered those two facts by how comfortable they are, and the second one is the one
 * somebody is going to test.
 *
 * THE RECIPIENT'S SWITCH IS A FACT AND NOT A CONTROL. Whether the statement names the service is
 * hers to decide, per sponsor, from her own account — “a line reading sexual health screening
 * discloses more than most diagnoses do” — so this screen shows which way it is set and offers no
 * way to change it. A disabled toggle would have been worse than none: it tells a sponsor they are
 * the sort of person who might be allowed to turn it on.
 *
 * Every sentence is packages/catalog/programmes.json's, by way of the generated ProgrammesData.kt.
 * Every amount is a service's own price, resolved by the generator, because a sponsored visit is not
 * a different visit and there is nowhere in the contract to type a figure. Nothing is paid, no
 * statement is issued, and no sponsorship exists.
 */

/** Whether this recipient has let this sponsor see which visit each line was.
 *
 * The statement's own note says she has — “which visit it was appears only because the recipient has
 * switched that on for this sponsor” — so it is her fact, read from the contract rather than
 * defaulted to the friendlier answer. A value rather than a constant expression so the other branch
 * stays live code: the day the contract carries the switch itself, this reads it. */
private val serviceIsNamed: Boolean = sponsorStatement.note.contains("switched that on")

@Composable private fun DisclosureLine(disclosure: Disclosure) {
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
        Text(disclosure.what, style = MaterialTheme.typography.titleSmall, color = Charcoal)
        Text(disclosure.why, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
    }
}

@Composable fun SponsoredCareScreen(store: PreviewStore, open: (String) -> Unit) {
    val statement = sponsorStatement
    /* Who is actually being paid for, on this account. The contract names Grace Mokoena and the
       household names somebody else; a person opening “care you pay for” in their own app is looking
       at their own family member, so the name comes from the household and every figure stays the
       contract's. Reported rather than patched around: the right fix is a reference in the contract
       to the household, not a second name in it. */
    val person = store.family.firstOrNull() ?: statement.recipient
    val first = person.substringBefore(' ')
    val detail = lineDetailChoices.first { it.id == if (serviceIsNamed) "service-named" else "amount-only" }
    val leastScope = guardianScopes.first()

    ScreenColumn {
        DemoBadge()
        Heading("Thuso Family", "Care you pay for.",
            "What has been used, what it cost, and what paying for it does and does not let you see.")
        NotConnected(of = "payments")

        /* Who, and the three figures a person opening a statement is looking for. */
        SPanel(tone = PanelTone.LEAD) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                Box(Modifier.size(44.dp).background(SurfaceWhite, CircleShape), Alignment.Center) {
                    Text(person.split(' ').mapNotNull { it.firstOrNull() }.take(2).joinToString(""),
                        style = MaterialTheme.typography.titleSmall, color = Charcoal)
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                    Text(person, style = MaterialTheme.typography.titleMedium, color = Charcoal)
                    Note(statement.relationship)
                }
                SChip("Sponsored care")
            }
            /* The figure without its symbol, so the metric can set the R small and leading the way
               the design language asks — taken off the one formatter rather than formatted again,
               so a metric and a statement line can never round differently. */
            fun figure(amount: Int) = rands(amount).removePrefix("R")
            MetricRow(listOf(
                MetricSpec(figure(statement.setAside), "You set aside", prefix = "R", chip = "For her care"),
                MetricSpec(figure(statement.spent), "Used so far", prefix = "R",
                    chip = "${statement.lines.size} ${if (statement.lines.size == 1) "visit" else "visits"}"),
                MetricSpec(figure(statement.remaining), "Left to draw on", prefix = "R",
                    chip = if (statement.remaining > 0) "Available" else "Nothing left")
            ))
        }

        /* An amount and a date on every line, and the service only because she has switched that on. */
        Section("What has been drawn") {
            /* A real amount column. The service and the amount used to share one right-aligned cell,
               which lines the figures up by accident — a statement is read down its money, so the
               money gets its own edge and the date and the service take the rest. */
            CareCard {
                statement.lines.forEach { line ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = ThusoSpacing.space8),
                        horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12),
                        verticalAlignment = Alignment.Top
                    ) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                            Text(
                                if (serviceIsNamed) line.service else "Care was given",
                                style = MaterialTheme.typography.bodyMedium, color = Charcoal
                            )
                            Note(Scheduling.shortDate(Scheduling.today().plusDays(line.onDays.toLong())))
                        }
                        Text(rands(line.amount), style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                    }
                    HorizontalDivider(color = StudioLine)
                }
                ReviewLine("Drawn from what you set aside", rands(statement.spent))
            }
            /* Not a control. Which of the two settings is on belongs to her, and a switch here — even
               a disabled one — implies it is a thing a sponsor could be given. */
            CareCard {
                Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12), verticalAlignment = Alignment.Top) {
                    TileIcon(Icons.Outlined.VisibilityOff, size = 36.dp)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                        Text(detail.name, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                        Text(detail.detail, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
                        Note("$first decides this, in her own account. It is not a setting on this screen and there is no way to ask for it.")
                    }
                }
                if (serviceIsNamed) Note(statement.note)
            }
        }

        /* The two lists, one after the other and the same size. This is the screen. */
        Section("What a sponsor sees, and what a sponsor never sees") {
            CareCard {
                Text("What you see", style = MaterialTheme.typography.titleMedium, color = Charcoal)
                sponsorSees.forEach { DisclosureLine(it) }
            }
            CareCard {
                Text("What you never see", style = MaterialTheme.typography.titleMedium, color = Charcoal)
                sponsorNeverSees.forEach { DisclosureLine(it) }
            }
            TonedCard(background = MangoSoft) {
                Text(Programmes.refusal("require-the-detail").sentence,
                    style = MaterialTheme.typography.bodyMedium, color = Charcoal)
            }
        }

        /* Where the line actually is, joined to the model that draws it. The least MyThuso can grant
           anybody is bookings and payments, and a sponsorship is not even that — it grants nothing,
           and what it would take to grant something is a decision made by her, on her side, with a
           scope and an end date on it. */
        Section("Paying for care is not access to it") {
            CareCard {
                val rule = Programmes.rule("paying-is-not-permission")
                Text(rule.title, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                Text(rule.sentence, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
                HorizontalDivider(color = StudioLine)
                Text("The least anybody can be given is more than this", style = MaterialTheme.typography.titleSmall, color = Charcoal)
                Text("${leastScope.first} — ${leastScope.second}", style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
                Note("And that is granted by $first, from her own account, with an end date on it. A sponsorship grants nothing at all, so there is nothing here to widen.")
            }
            OutlinedButton(
                onClick = { open("My family") },
                Modifier.fillMaxWidth().heightIn(min = TouchTarget), shape = ThusoButtonShape
            ) { Text("See what you may see of $first") }
        }

        Section("How it starts, and how she stops it") {
            CareCard {
                Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12), verticalAlignment = Alignment.Top) {
                    TileIcon(Icons.Outlined.HowToReg, size = 36.dp)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                        Text(sponsorConsent.headline, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                        Text(sponsorConsent.detail, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
                    }
                }
                Note(sponsorConsent.withdrawal)
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
            OutlinedButton(
                onClick = { open("Thuso Wallet") },
                Modifier.weight(1f).heightIn(min = TouchTarget), shape = ThusoButtonShape
            ) { Text("Open Thuso Wallet") }
        }
    }
}
