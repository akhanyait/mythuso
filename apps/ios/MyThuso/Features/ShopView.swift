import SwiftUI

/* THE SHOP — the screen in this product a person is most likely to mistake for a real one, because
 * shops are the thing they have used most often online.
 *
 * SO THE TWO REFUSALS COME FIRST, ABOVE ANYTHING IT SELLS. Not in a footnote and not behind a
 * disclosure triangle: that no card is charged, and that no medicine is sold here. Both are
 * rendered word for word from ShopData, which is generated from the same contract the web app and
 * the Android app read, so all three say it identically.
 *
 * THE DARK CARD IS SPENT ON THE BALANCE, because that is the only live number on the screen — and
 * under it, what it is worth, multiplied out of RewardsData.randPerPoint rather than written down.
 * A literal rate here would be a second copy of a figure that lives in the contract, and the day
 * that figure changes this screen would go on quietly using the old one.
 *
 * EVERY PRODUCT THAT PRODUCES A NUMBER CARRIES THE SENTENCE SAYING A NUMBER IS NOT A DIAGNOSIS, and
 * it is attached to the product rather than to the page, so it cannot be scrolled past. A person
 * who buys an oximeter because a screen implied it would tell them whether they are ill will act
 * on a reading nobody has interpreted.
 *
 * THE REFUSALS PANEL AT THE END IS ALL OF THEM, from both contracts — the shop's seven and the
 * points' ten. A reader who reaches the bottom of this screen has read what MyThuso will not do
 * with a loyalty scheme attached to healthcare. */
struct ShopView: View {
    @State private var basket: [BasketLine] = []
    @State private var ledger: [PointsEntry] = []
    @State private var category = "all"
    @State private var pointsSpent = 0
    @State private var notice: String?
    @State private var showingPoints = false

    private var points: Int { ledger.reduce(0) { $0 + $1.points } }
    private var tier: RewardsData.Tier { Commerce.tier(points: points) }
    private var goods: Int { Commerce.goodsCents(basket) }
    private var products: [ShopData.Product] {
        category == "all" ? ShopData.products : ShopData.products.filter { $0.category == category }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                balanceCard
                refusalLine("no-payment", emphasised: true)
                refusalLine("no-medicine")
                Picker("", selection: $showingPoints) {
                    Text("Shop").tag(false)
                    Text("Points").tag(true)
                }
                .pickerStyle(.segmented)

                if showingPoints { pointsPanel } else { shopPanel }

                if let notice { Text(notice).thusoFont(ThusoType.caption).foregroundStyle(.secondary) }
                refusalsPanel
            }
            .padding(20)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Shop")
    }

    private var balanceCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("THUSO POINTS").thusoFont(ThusoType.caption, weight: .semibold).kerning(1.2).foregroundStyle(.green)
            Text("\(points)").font(ThusoFont.metricLarge)
            // Worth is multiplied, never typed. See the note at the top of this file.
            Text("worth \(Commerce.randValue(points: points, track: "household"), format: .currency(code: ShopData.currency)) off goods")
                .thusoFont(ThusoType.caption).foregroundStyle(.white.opacity(0.75))
            Text(tier.name).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(.green)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(22)
        .background(Color.black.opacity(0.88), in: RoundedRectangle(cornerRadius: 22))
        .foregroundStyle(.white)
    }

    private var shopPanel: some View {
        VStack(alignment: .leading, spacing: 14) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    chip("Everything", id: "all")
                    ForEach(ShopData.categories) { chip($0.name, id: $0.id) }
                }
            }
            ForEach(products) { product in
                VStack(alignment: .leading, spacing: 7) {
                    Text(product.name).font(.thuso(.headline))
                    Text(product.does).font(.thuso(.subheadline)).foregroundStyle(.secondary)
                    // Attached to the product, so it cannot be scrolled past.
                    if product.needsReading { refusalLine("reading-is-not-advice") }
                    HStack {
                        Text(Double(product.priceCents) / 100, format: .currency(code: ShopData.currency)).font(.thuso(.title3, weight: .bold))
                        Spacer()
                        Button("Add") { add(product) }.buttonStyle(.borderedProminent).tint(.green)
                    }
                }
                .padding(16)
                .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18))
            }
            if !basket.isEmpty { basketCard }
        }
    }

    private var basketCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Basket").font(.thuso(.headline))
            ForEach(basket) { line in
                if let product = ShopData.product(line.productId) {
                    HStack {
                        Text(product.name).font(.thuso(.subheadline))
                        Spacer()
                        Text("×\(line.quantity)").foregroundStyle(.secondary)
                        Text(Double(product.priceCents * line.quantity) / 100, format: .currency(code: ShopData.currency))
                    }
                }
            }
            Divider()
            let delivery = Commerce.deliveryCents(goods: goods, freeDelivery: tier.id != "green")
            HStack { Text("Delivery").foregroundStyle(.secondary); Spacer()
                Text(Double(delivery) / 100, format: .currency(code: ShopData.currency)) }
            HStack {
                Text("Would come to").font(.thuso(.headline))
                Spacer()
                Text(Double(Commerce.totalCents(lines: basket, pointsSpent: pointsSpent, freeDelivery: tier.id != "green")) / 100,
                     format: .currency(code: ShopData.currency)).font(.thuso(.headline))
            }
            Button("Hold stock and quote me") { quote() }
                .buttonStyle(.borderedProminent).tint(.green).frame(maxWidth: .infinity)
            refusalLine("no-payment")
        }
        .padding(18)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20))
    }

    private var pointsPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(RewardsData.earnReasons.filter { $0.track == "household" }) { reason in
                VStack(alignment: .leading, spacing: 4) {
                    Text(reason.name).font(.thuso(.subheadline, weight: .semibold))
                    if let fixed = reason.points { Text("\(fixed) points").thusoFont(ThusoType.caption) }
                    else if let perRand = reason.perRand { Text("\(perRand, specifier: "%g") point per rand").thusoFont(ThusoType.caption) }
                    // What the ledger row will say, shown before it is written.
                    Text("Recorded as: \(reason.discloses). Never \(reason.never).")
                        .thusoFont(ThusoType.caption).foregroundStyle(.secondary)
                    if let fixed = reason.points {
                        Button("Simulate") { earn(reason.id, points: fixed, note: reason.discloses) }
                            .buttonStyle(.bordered)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
            }
            Text("Your points history").font(.thuso(.headline))
            if ledger.isEmpty { Text("Nothing yet.").thusoFont(ThusoType.caption).foregroundStyle(.secondary) }
            ForEach(ledger.reversed()) { entry in
                HStack {
                    VStack(alignment: .leading) {
                        Text(RewardsData.reason(entry.reason)?.name ?? entry.reason).font(.thuso(.subheadline))
                        Text(entry.note).thusoFont(ThusoType.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(entry.points > 0 ? "+\(entry.points)" : "\(entry.points)")
                }
            }
            refusalLine("ledger-holds-nothing-clinical")
        }
    }

    private var refusalsPanel: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text("What this shop will not do").font(.thuso(.headline))
            ForEach(ShopData.refusals) { Text($0.sentence).thusoFont(ThusoType.caption).foregroundStyle(.secondary) }
            ForEach(RewardsData.refusals) { Text($0.sentence).thusoFont(ThusoType.caption).foregroundStyle(.secondary) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 8)
    }

    private func chip(_ label: String, id: String) -> some View {
        Button(label) { category = id }
            .buttonStyle(.bordered)
            .tint(category == id ? .green : .gray)
    }

    /// Rendered from the contract by id. A sentence typed here would be a fourth copy.
    private func refusalLine(_ id: String, emphasised: Bool = false) -> some View {
        Text(ShopData.refusal(id)?.sentence ?? RewardsData.refusal(id)?.sentence ?? "")
            .thusoFont(ThusoType.caption)
            .foregroundStyle(emphasised ? .primary : .secondary)
            .padding(emphasised ? 12 : 0)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(emphasised ? Color.orange.opacity(0.16) : .clear, in: RoundedRectangle(cornerRadius: 12))
    }

    private func add(_ product: ShopData.Product) {
        if let at = basket.firstIndex(where: { $0.productId == product.id }) { basket[at].quantity += 1 }
        else { basket.append(BasketLine(productId: product.id, quantity: 1)) }
        notice = "\(product.name) added to the basket."
    }

    private func earn(_ reason: String, points: Int, note: String) {
        ledger.append(PointsEntry(id: ledger.count + 1, reason: reason, note: note, points: points, at: Date(), expiresAt: nil))
    }

    private func quote() {
        let earned = Commerce.pointsEarned(basket)
        if earned > 0, let reason = RewardsData.reason("goods-purchased") {
            earn(reason.id, points: earned, note: reason.discloses)
        }
        basket.removeAll()
        pointsSpent = 0
        notice = "Stock held and a quote written. No card was charged."
    }
}
