package za.co.mythuso.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import za.co.mythuso.model.*

/* THE SHOP — the screen a person is most likely to mistake for a real one, because shops are the
 * thing they have used most often online.
 *
 * So the two refusals come first, above anything it sells: that no card is charged, and that no
 * medicine is sold here. Both are rendered word for word from ShopData, generated from the same
 * contract the web and iOS apps read, so all three say it identically.
 *
 * The dark card is spent on the balance — the only live number here — and under it what it is
 * worth, multiplied out of RewardsData.randPerPoint rather than written down.
 *
 * Every product that produces a number carries the sentence saying a number is not a diagnosis,
 * attached to the product rather than the page so it cannot be scrolled past. The refusals panel
 * at the end is all seventeen, from both contracts. */

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

    val points = ledger.sumOf { it.points }
    val tier = Commerce.tier(points)
    val goods = Commerce.goodsCents(basket)
    val products = if (category == "all") shopProducts else shopProducts.filter { it.category == category }

    Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        // The balance, and what it is worth — multiplied, never typed.
        Column(
            Modifier.fillMaxWidth().background(Color(0xFF202923), RoundedCornerShape(22.dp)).padding(22.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text("THUSO POINTS", color = Color(0xFFC9E265), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            Text("$points", color = Color.White, fontSize = 38.sp, fontWeight = FontWeight.Bold)
            Text("worth ${rands(points * Commerce.centsPerPoint())} off goods", color = Color(0xFFCFD4CD), fontSize = 13.sp)
            Text(tier.name, color = Color(0xFFC9E265), fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        }

        RefusalLine(ShopData.refusal("no-payment")?.sentence, emphasised = true)
        RefusalLine(ShopData.refusal("no-medicine")?.sentence)

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(!showingPoints, { showingPoints = false }, { Text("Shop") })
            FilterChip(showingPoints, { showingPoints = true }, { Text("Points") })
        }

        if (!showingPoints) {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(category == "all", { category = "all" }, { Text("Everything") })
                shopCategories.forEach { c -> FilterChip(category == c.id, { category = c.id }, { Text(c.name) }) }
            }
            products.forEach { product ->
                Column(
                    Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface, RoundedCornerShape(18.dp)).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(product.name, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                    Text(product.does, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    // Attached to the product, so it cannot be scrolled past.
                    if (product.needsReading) RefusalLine(ShopData.refusal("reading-is-not-advice")?.sentence)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text(rands(product.priceCents), fontSize = 19.sp, fontWeight = FontWeight.Bold)
                        Button(onClick = {
                            val at = basket.indexOfFirst { it.productId == product.id }
                            basket = if (at >= 0) basket.mapIndexed { i, l -> if (i == at) l.copy(quantity = l.quantity + 1) else l }
                                     else basket + BasketLine(product.id, 1)
                            notice = "${product.name} added to the basket."
                        }) { Text("Add") }
                    }
                }
            }
            if (basket.isNotEmpty()) {
                Column(
                    Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface, RoundedCornerShape(20.dp)).padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text("Basket", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                    basket.forEach { line ->
                        ShopData.product(line.productId)?.let { p ->
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("${p.name} ×${line.quantity}", fontSize = 14.sp)
                                Text(rands(p.priceCents * line.quantity), fontSize = 14.sp)
                            }
                        }
                    }
                    HorizontalDivider()
                    val delivery = Commerce.deliveryCents(goods, tier.id != "green")
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Delivery", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
                        Text(rands(delivery), fontSize = 14.sp)
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
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Hold stock and quote me") }
                    RefusalLine(ShopData.refusal("no-payment")?.sentence)
                }
            }
        } else {
            rewardEarnReasons.filter { it.track == "household" }.forEach { reason ->
                Column(
                    Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface, RoundedCornerShape(16.dp)).padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(reason.name, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                    Text(
                        reason.points?.let { "$it points" } ?: "${reason.perRand} point per rand",
                        fontSize = 13.sp
                    )
                    // What the ledger row will say, shown before it is written.
                    Text("Recorded as: ${reason.discloses}. Never ${reason.never}.", fontSize = 12.sp,
                         color = MaterialTheme.colorScheme.onSurfaceVariant)
                    reason.points?.let { fixed ->
                        OutlinedButton(onClick = {
                            ledger = ledger + PointsEntry(ledger.size + 1, reason.id, reason.discloses, fixed)
                        }) { Text("Simulate") }
                    }
                }
            }
            Text("Your points history", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
            if (ledger.isEmpty()) Text("Nothing yet.", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            ledger.reversed().forEach { e ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column {
                        Text(RewardsData.reason(e.reason)?.name ?: e.reason, fontSize = 14.sp)
                        Text(e.note, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text(if (e.points > 0) "+${e.points}" else "${e.points}", fontSize = 14.sp)
                }
            }
            RefusalLine(RewardsData.refusal("ledger-holds-nothing-clinical")?.sentence)
        }

        notice?.let { Text(it, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }

        Text("What this shop will not do", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
        shopRefusals.forEach { Text(it.sentence, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        rewardRefusals.forEach { Text(it.sentence, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

/** Rendered from the contract by id. A sentence typed here would be a fourth copy. */
@Composable
private fun RefusalLine(sentence: String?, emphasised: Boolean = false) {
    if (sentence == null) return
    Text(
        sentence,
        fontSize = 13.sp,
        color = if (emphasised) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = if (emphasised)
            Modifier.fillMaxWidth().background(Color(0xFFF6DDCD), RoundedCornerShape(12.dp)).padding(12.dp)
        else Modifier.fillMaxWidth()
    )
}
