package za.co.mythuso.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import za.co.mythuso.model.*

/* THE SHOP — the screen a person is most likely to mistake for a real one, because shops are the
 * thing they have used most often online.
 *
 * So the two refusals come first, above anything it sells: that no card is charged, and that no
 * medicine is sold here. Both are rendered word for word from ShopData, generated from the same
 * contract the web and iOS apps read, so all three say it identically.
 *
 * Since 2 October 2026 it is a storefront with pictures: each product carries a 480×360 copy of the
 * web's generated photograph from drawable-nodpi (shop_<id>), labelled "Illustrative image" where it
 * is drawn, and opens onto what you, your nurse and your doctor see — each line saying in a word
 * whether this preview does it or it is planned. Those lines are worked out by scripts/emit-shop.mjs
 * from the contracts that own them. A kit has no price of its own; ShopData.priceCents adds up its
 * items. The welcome monitor is a plan and is drawn as one, because sign-up is not live.
 *
 * Every product that produces a number carries the sentence saying a number is not a diagnosis,
 * attached to the product rather than the page so it cannot be scrolled past. The refusals panel
 * at the end is all of them, from both contracts. */

private fun rands(cents: Int): String {
    val whole = cents / 100
    val part = cents % 100
    return if (part == 0) "R$whole" else "R$whole,%02d".format(part)
}

@Composable
fun ShopScreen() {
    var basket by remember { mutableStateOf(listOf<BasketLine>()) }
    var ledger by remember { mutableStateOf(listOf<PointsEntry>()) }
    var category by remember { mutableStateOf("all") }
    var showingPoints by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<String?>(null) }
    var open by remember { mutableStateOf<String?>(null) }

    val points = ledger.sumOf { it.points }
    val tier = Commerce.tier(points)
    val goods = Commerce.goodsCents(basket)
    val products = if (category == "all") shopProducts else shopProducts.filter { it.category == category }
    val add: (ShopProduct) -> Unit = { product ->
        val at = basket.indexOfFirst { it.productId == product.id }
        basket = if (at >= 0) basket.mapIndexed { i, l -> if (i == at) l.copy(quantity = l.quantity + 1) else l }
                 else basket + BasketLine(product.id, 1)
        notice = "${product.name} added to the basket."
    }

    // A product, opened, replaces the shelf; the back button in it returns. The shelf keeps its filter.
    open?.let { id -> ShopData.product(id)?.let { ShopProductPanel(it, add = { add(it) }, close = { open = null }); return } }

    Column(Modifier.background(StudioPaper).padding(ThusoSpacing.space20), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space16)) {
        // The balance, and what it is worth — multiplied, never typed.
        Column(
            Modifier.fillMaxWidth().background(BrandInk, RoundedCornerShape(ThusoRadius.card)).padding(ThusoSpacing.space20),
            verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)
        ) {
            Text("THUSO POINTS", color = BrandLime, fontSize = ThusoType.caption, fontWeight = FontWeight.SemiBold)
            Text("$points", color = Color.White, fontSize = ThusoType.metricLarge, fontWeight = FontWeight.Bold)
            Text("worth ${rands(points * Commerce.centsPerPoint())} off goods", color = Color.White.copy(alpha = 0.8f), fontSize = ThusoType.caption)
            Text(tier.name, color = BrandLime, fontSize = ThusoType.minimumBody, fontWeight = FontWeight.SemiBold)
        }

        RefusalLine(ShopData.refusal("no-payment")?.sentence, emphasised = true)
        RefusalLine(ShopData.refusal("no-medicine")?.sentence)

        Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
            FilterChip(!showingPoints, { showingPoints = false }, { Text("Shop") })
            FilterChip(showingPoints, { showingPoints = true }, { Text("Points") })
        }

        if (!showingPoints) {
            WelcomeCard(onOpen = { open = ShopWelcome.productId })
            listOf("no-device-licence", "unbranded", "illustrative-image", "pairing-simulated").forEach { RefusalLine(ShopData.refusal(it)?.sentence) }
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
                FilterChip(category == "all", { category = "all" }, { Text("Everything") })
                shopCategories.forEach { c -> FilterChip(category == c.id, { category = c.id }, { Text(c.name) }) }
                FilterChip(category == "kits", { category = "kits" }, { Text("Kits") })
            }
            if (category == "all" || category == "kits") {
                Text("Kits", fontSize = ThusoType.sectionTitle, fontWeight = FontWeight.SemiBold, modifier = Modifier.semantics { heading() })
                shopKits.forEach { kit -> KitCard(kit) { kit.items.mapNotNull { ShopData.product(it) }.forEach(add) } }
            }
            if (category != "kits") products.forEach { product ->
                ShopCard {
                    Column(
                        Modifier.fillMaxWidth().clickable(onClickLabel = "Open what it reads and who sees it", role = Role.Button) { open = product.id },
                        verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)
                    ) {
                        product.detail?.let { ShopPicture(it.image, it.alt) }
                        Text(ShopData.category(product.category)?.name ?: "", fontSize = ThusoType.caption, color = Faint)
                        Text(product.name, fontWeight = FontWeight.SemiBold, fontSize = ThusoType.cardTitle, color = Ink)
                        product.detail?.let { ReadingsLine(it) }
                        Text(product.does, fontSize = ThusoType.minimumBody, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    // Attached to the product, so it cannot be scrolled past.
                    if (product.needsReading) RefusalLine(ShopData.refusal("reading-is-not-advice")?.sentence)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text(rands(product.priceCents), fontSize = ThusoType.sectionTitle, fontWeight = FontWeight.Bold)
                        Button(onClick = { add(product) }, colors = ButtonDefaults.buttonColors(containerColor = BrandInk)) { Text("Add to basket") }
                    }
                }
            }
            if (basket.isNotEmpty()) {
                ShopCard {
                    Text("Basket", fontWeight = FontWeight.SemiBold, fontSize = ThusoType.cardTitle)
                    basket.forEach { line ->
                        ShopData.product(line.productId)?.let { p ->
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("${p.name} ×${line.quantity}", fontSize = ThusoType.minimumBody, modifier = Modifier.weight(1f))
                                Text(rands(p.priceCents * line.quantity), fontSize = ThusoType.minimumBody)
                            }
                        }
                    }
                    HorizontalDivider()
                    val delivery = Commerce.deliveryCents(goods, tier.id != "green")
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Delivery", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = ThusoType.minimumBody)
                        Text(rands(delivery), fontSize = ThusoType.minimumBody)
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Would come to", fontWeight = FontWeight.SemiBold)
                        Text(rands(Commerce.totalCents(basket, 0, tier.id != "green")), fontWeight = FontWeight.Bold)
                    }
                    Button(
                        onClick = {
                            val earned = Commerce.pointsEarned(basket)
                            RewardsData.reason("goods-purchased")?.let { r ->
                                if (earned > 0) ledger = ledger + PointsEntry(ledger.size + 1, r.id, r.discloses, earned)
                            }
                            basket = emptyList()
                            notice = "Stock held and a quote written. No card was charged."
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = BrandInk)
                    ) { Text("Hold stock and quote me") }
                    RefusalLine(ShopData.refusal("no-payment")?.sentence)
                }
            }
        } else {
            rewardEarnReasons.filter { it.track == "household" }.forEach { reason ->
                ShopCard {
                    Text(reason.name, fontWeight = FontWeight.SemiBold, fontSize = ThusoType.minimumBody)
                    Text(reason.points?.let { "$it points" } ?: "${reason.perRand} point per rand", fontSize = ThusoType.caption)
                    // What the ledger row will say, shown before it is written.
                    Text("Recorded as: ${reason.discloses}. Never ${reason.never}.", fontSize = ThusoType.caption,
                         color = MaterialTheme.colorScheme.onSurfaceVariant)
                    reason.points?.let { fixed ->
                        OutlinedButton(onClick = {
                            ledger = ledger + PointsEntry(ledger.size + 1, reason.id, reason.discloses, fixed)
                        }) { Text("Simulate") }
                    }
                }
            }
            Text("Your points history", fontWeight = FontWeight.SemiBold, fontSize = ThusoType.cardTitle)
            if (ledger.isEmpty()) Text("Nothing yet.", fontSize = ThusoType.caption, color = MaterialTheme.colorScheme.onSurfaceVariant)
            ledger.reversed().forEach { e ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column(Modifier.weight(1f)) {
                        Text(RewardsData.reason(e.reason)?.name ?: e.reason, fontSize = ThusoType.minimumBody)
                        Text(e.note, fontSize = ThusoType.caption, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text(if (e.points > 0) "+${e.points}" else "${e.points}", fontSize = ThusoType.minimumBody)
                }
            }
            RefusalLine(RewardsData.refusal("ledger-holds-nothing-clinical")?.sentence)
        }

        notice?.let { Text(it, fontSize = ThusoType.caption, color = MaterialTheme.colorScheme.onSurfaceVariant) }

        Text("What this shop will not do", fontWeight = FontWeight.SemiBold, fontSize = ThusoType.cardTitle, modifier = Modifier.semantics { heading() })
        shopRefusals.forEach { Text(it.sentence, fontSize = ThusoType.caption, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        rewardRefusals.forEach { Text(it.sentence, fontSize = ThusoType.caption, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

@Composable
private fun ShopCard(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxWidth().background(Color.White, RoundedCornerShape(ThusoRadius.card))
            .border(BorderStroke(ThusoSpacing.space4 / 4, Line), RoundedCornerShape(ThusoRadius.card)).padding(ThusoSpacing.space16),
        verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8),
        content = content
    )
}

/** A generated product photograph in its 4:3 frame, with the contract's label on it. */
@Composable
private fun ShopPicture(image: Int, alt: String) {
    Box(Modifier.fillMaxWidth().aspectRatio(4f / 3f).clip(RoundedCornerShape(ThusoRadius.tile))
        .semantics(mergeDescendants = true) { contentDescription = "$alt ${ShopData.imageLabel}." }) {
        Image(painterResource(image), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        Text(
            ShopData.imageLabel, fontSize = ThusoType.caption, color = Ink,
            modifier = Modifier.align(Alignment.BottomStart).padding(ThusoSpacing.space8)
                .background(Color.White.copy(alpha = 0.9f), RoundedCornerShape(ThusoRadius.pill))
                .padding(horizontal = ThusoSpacing.space8, vertical = ThusoSpacing.space4)
        )
    }
}

/** What a product reads, in words, and how the reading reaches the app. */
@Composable
private fun ReadingsLine(detail: ShopDetail) {
    val words = detail.readings + when (detail.connection) { "bluetooth" -> listOf("Bluetooth"); "typed" -> listOf("Typed in"); else -> emptyList() }
    if (words.isNotEmpty()) Text(words.joinToString(" · "), fontSize = ThusoType.caption, fontWeight = FontWeight.SemiBold, color = BrandInk)
}

/* The planned welcome monitor: the contract's label first, then what it would cover, then the refusal
   that says nobody can claim it. */
@Composable
private fun WelcomeCard(onOpen: () -> Unit) {
    var conditions by remember { mutableStateOf(false) }
    ShopCard {
        ShopData.product(ShopWelcome.productId)?.detail?.let { ShopPicture(it.image, it.alt) }
        Text(ShopWelcome.label, fontSize = ThusoType.caption, fontWeight = FontWeight.SemiBold, color = Ink,
             modifier = Modifier.background(MangoSoft, RoundedCornerShape(ThusoRadius.pill)).padding(horizontal = ThusoSpacing.space8, vertical = ThusoSpacing.space4))
        Text(ShopWelcome.headline, fontSize = ThusoType.sectionTitle, fontWeight = FontWeight.SemiBold, modifier = Modifier.semantics { heading() })
        Text(ShopWelcome.intro, fontSize = ThusoType.minimumBody, color = MaterialTheme.colorScheme.onSurfaceVariant)
        ShopWelcome.covers.forEach { Text("✓  $it", fontSize = ThusoType.minimumBody) }
        TextButton(onClick = { conditions = !conditions }) { Text(if (conditions) "Hide the conditions" else "The conditions") }
        if (conditions) ShopWelcome.conditions.forEach { Text("•  $it", fontSize = ThusoType.caption) }
        RefusalLine(ShopData.refusal("welcome-not-live")?.sentence)
        OutlinedButton(onClick = onOpen) { Text("What the monitor reads, and who sees it") }
    }
}

@Composable
private fun KitCard(kit: ShopKit, addAll: () -> Unit) {
    ShopCard {
        ShopPicture(kit.image, kit.alt)
        Text(kit.name, fontWeight = FontWeight.SemiBold, fontSize = ThusoType.cardTitle)
        Text(kit.does, fontSize = ThusoType.minimumBody, color = MaterialTheme.colorScheme.onSurfaceVariant)
        kit.items.mapNotNull { ShopData.product(it) }.forEach { item ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(item.name, fontSize = ThusoType.minimumBody, modifier = Modifier.weight(1f))
                Text(rands(item.priceCents), fontSize = ThusoType.minimumBody)
            }
        }
        HorizontalDivider()
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("The kit comes to", fontSize = ThusoType.minimumBody)
            // Worked out from its items; a kit has no price of its own.
            Text(rands(ShopData.priceCents(kit)), fontSize = ThusoType.sectionTitle, fontWeight = FontWeight.Bold)
        }
        Button(onClick = addAll, colors = ButtonDefaults.buttonColors(containerColor = BrandInk)) { Text("Add ${kit.items.size} items") }
    }
}

/** A product, opened: the picture, the price against its reference, and who sees what. */
@Composable
private fun ShopProductPanel(product: ShopProduct, add: () -> Unit, close: () -> Unit) {
    val detail = product.detail ?: return
    Column(Modifier.background(StudioPaper).padding(ThusoSpacing.space20), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space16)) {
        TextButton(onClick = close) { Text("← Back to the shop") }
        ShopPicture(detail.image, detail.alt)
        Text(product.name, fontSize = ThusoType.heading, fontWeight = FontWeight.SemiBold, modifier = Modifier.semantics { heading() })
        Text(product.does, fontSize = ThusoType.body, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(rands(product.priceCents), fontSize = ThusoType.metric, fontWeight = FontWeight.Bold)
            Button(onClick = add, colors = ButtonDefaults.buttonColors(containerColor = BrandInk)) { Text("Add to basket") }
        }
        Text("Reference price ${rands(detail.referenceLowCents)}–${rands(detail.referenceHighCents)} at ${detail.referenceFrom}, checked ${detail.referenceChecked}.",
             fontSize = ThusoType.caption, color = Faint)
        Text(detail.regulatory, fontSize = ThusoType.caption)
        if (detail.connection == "bluetooth") RefusalLine(ShopData.refusal("pairing-simulated")?.sentence)
        if (detail.readings.isNotEmpty()) PanelSection("The readings it takes") { Text(detail.readings.joinToString(" · "), fontWeight = FontWeight.SemiBold) }
        detail.outsideRecord.forEach { Text(it, fontSize = ThusoType.caption, color = Faint) }
        if (product.needsReading) RefusalLine(ShopData.refusal("reading-is-not-advice")?.sentence)
        SeenSection("What you see", detail.patient)
        SeenSection("What your nurse sees", detail.nurse)
        SeenSection("What your doctor sees", detail.doctor)
        PanelSection("What it has") { detail.features.forEach { Text("•  $it", fontSize = ThusoType.minimumBody) } }
        PanelSection("Who it is for") { Text(detail.forWhom, fontSize = ThusoType.minimumBody) }
        PanelSection("What it is not") {
            detail.whatItIsNot.forEach { Text("•  $it", fontSize = ThusoType.minimumBody) }
            RefusalLine(ShopData.refusal("no-claim")?.sentence)
        }
    }
}

@Composable
private fun PanelSection(title: String, content: @Composable ColumnScope.() -> Unit) {
    ShopCard {
        Text(title, fontWeight = FontWeight.SemiBold, fontSize = ThusoType.cardTitle, modifier = Modifier.semantics { heading() })
        content()
    }
}

/** Each line says in a word whether this preview does it, never by colour alone. */
@Composable
private fun SeenSection(title: String, lines: List<ShopSeen>) {
    PanelSection(title) {
        if (lines.isEmpty()) Text("Nothing through MyThuso from this device.", fontSize = ThusoType.minimumBody, color = Faint)
        lines.forEach { line ->
            Column(Modifier.semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                Text(line.text, fontSize = ThusoType.minimumBody)
                Text(if (line.planned) "Planned" else "In this preview", fontSize = ThusoType.caption, fontWeight = FontWeight.SemiBold,
                     color = if (line.planned) Faint else BrandInk)
            }
        }
    }
}

/** Rendered from the contract by id. A sentence typed here would be a fourth copy. */
@Composable
private fun RefusalLine(sentence: String?, emphasised: Boolean = false) {
    if (sentence == null) return
    Text(
        sentence,
        fontSize = ThusoType.caption,
        color = if (emphasised) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = if (emphasised)
            Modifier.fillMaxWidth().background(MangoSoft, RoundedCornerShape(ThusoRadius.control)).padding(ThusoSpacing.space12)
        else Modifier.fillMaxWidth()
    )
}
