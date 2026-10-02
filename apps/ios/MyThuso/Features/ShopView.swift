import SwiftUI

/* THE SHOP — the screen in this product a person is most likely to mistake for a real one, because
 * shops are the thing they have used most often online.
 *
 * SO THE TWO REFUSALS COME FIRST, ABOVE ANYTHING IT SELLS. Not in a footnote and not behind a
 * disclosure triangle: that no card is charged, and that no medicine is sold here. Both are
 * rendered word for word from ShopData, which is generated from the same contract the web app and
 * the Android app read, so all three say it identically.
 *
 * SINCE 2 OCTOBER 2026 IT IS A STOREFRONT WITH PICTURES. Each product carries a 480×360 copy of the
 * web's generated photograph from the asset catalogue (Shop-<id>), labelled "Illustrative image"
 * where it is drawn, and a detail screen whose centre is three lists — what you, your nurse and your
 * doctor see — each line saying whether this preview does it or it is planned. Those lines, the
 * readings a device takes and the regulatory class are worked out by scripts/emit-shop.mjs from the
 * contracts that own them, so nothing on this screen is a sentence typed for the phone.
 *
 * A KIT HAS NO PRICE OF ITS OWN. ShopData.priceCents(of:) adds up its items wherever it is drawn.
 *
 * THE WELCOME MONITOR IS A PLAN, and is drawn as one: its label is the contract's, and the refusal
 * under it says nobody can claim it, because sign-up is not live. */
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
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                balanceCard
                refusalLine("no-payment", emphasised: true)
                refusalLine("no-medicine")
                Picker("Shop or points", selection: $showingPoints) {
                    Text("Shop").tag(false)
                    Text("Points").tag(true)
                }
                .pickerStyle(.segmented)

                if showingPoints { pointsPanel } else { shopPanel }

                if let notice { Text(notice).thusoFont(ThusoType.caption).foregroundStyle(.secondary) }
                refusalsPanel
            }
            .padding(ThusoSpacing.space20)
        }
        .background(ThusoTheme.studioPaper)
        .navigationTitle("Shop")
    }

    private var balanceCard: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
            Text("THUSO POINTS").thusoFont(ThusoType.caption, weight: .semibold).kerning(1.2).foregroundStyle(ThusoTheme.brandLime)
            Text("\(points)").font(ThusoFont.metricLarge)
            // Worth is multiplied, never typed. See the note at the top of this file.
            Text("worth \(Commerce.randValue(points: points, track: "household"), format: .currency(code: ShopData.currency)) off goods")
                .thusoFont(ThusoType.caption).foregroundStyle(.white.opacity(0.8))
            Text(tier.name).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoTheme.brandLime)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(ThusoSpacing.space20)
        .background(ThusoTheme.brandInk, in: RoundedRectangle(cornerRadius: ThusoRadius.card))
        .foregroundStyle(.white)
    }

    private var shopPanel: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
            welcomeCard
            VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                ForEach(["no-device-licence", "unbranded", "illustrative-image", "pairing-simulated"], id: \.self) { refusalLine($0) }
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: ThusoSpacing.space8) {
                    chip("Everything", id: "all")
                    ForEach(ShopData.categories) { chip($0.name, id: $0.id) }
                    chip("Kits", id: "kits")
                }
            }
            if category == "kits" || category == "all" {
                Text("Kits").font(.thuso(.title3, weight: .semibold))
                ForEach(ShopData.kits) { kitCard($0) }
            }
            if category != "kits" {
                ForEach(products) { product in productCard(product) }
            }
            if !basket.isEmpty { basketCard }
        }
    }

    /* The planned welcome monitor: the contract's label first, then what it would cover, then the
       refusal that says it cannot be claimed. */
    private var welcomeCard: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            ShopPicture(name: "Shop-\(ShopData.Welcome.productId)", alt: ShopData.product(ShopData.Welcome.productId)?.detail.alt ?? "")
            Label(ShopData.Welcome.label, systemImage: "gift")
                .thusoFont(ThusoType.caption, weight: .semibold)
                .padding(.horizontal, ThusoSpacing.space8).padding(.vertical, ThusoSpacing.space4)
                .background(ThusoTheme.mangoSoft, in: Capsule())
            Text(ShopData.Welcome.headline).font(.thuso(.title3, weight: .semibold))
            Text(ShopData.Welcome.intro).font(.thuso(.subheadline)).foregroundStyle(.secondary)
            ForEach(ShopData.Welcome.covers, id: \.self) { line in
                Label { Text(line).font(.thuso(.subheadline)) } icon: { Image(systemName: "checkmark").foregroundStyle(ThusoTheme.brandGreen) }
            }
            DisclosureGroup("The conditions") {
                VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                    ForEach(ShopData.Welcome.conditions, id: \.self) { Text($0).thusoFont(ThusoType.caption) }
                }.frame(maxWidth: .infinity, alignment: .leading).padding(.top, ThusoSpacing.space8)
            }
            .font(.thuso(.subheadline, weight: .semibold))
            refusalLine("welcome-not-live")
            if let monitor = ShopData.product(ShopData.Welcome.productId) {
                NavigationLink { ShopProductView(product: monitor, add: { add(monitor) }) } label: {
                    Text("What the monitor reads, and who sees it").font(.thuso(.subheadline, weight: .semibold))
                }
            }
        }
        .padding(ThusoSpacing.space16)
        .background(ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.card))
        .overlay(RoundedRectangle(cornerRadius: ThusoRadius.card).stroke(ThusoTheme.line))
    }

    private func productCard(_ product: ShopData.Product) -> some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            NavigationLink { ShopProductView(product: product, add: { add(product) }) } label: {
                VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                    ShopPicture(name: product.detail.image, alt: product.detail.alt)
                    Text(ShopData.category(product.category)?.name ?? "").thusoFont(ThusoType.caption).foregroundStyle(.secondary)
                    Text(product.name).font(.thuso(.headline)).foregroundStyle(ThusoTheme.ink).multilineTextAlignment(.leading)
                    ShopReadings(product: product)
                    Text(product.does).font(.thuso(.subheadline)).foregroundStyle(.secondary).multilineTextAlignment(.leading)
                }
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens what it reads and who sees it")
            // Attached to the product, so it cannot be scrolled past.
            if product.needsReading { refusalLine("reading-is-not-advice") }
            HStack {
                Text(Double(product.priceCents) / 100, format: .currency(code: ShopData.currency)).font(.thuso(.title3, weight: .bold))
                Spacer()
                Button("Add to basket") { add(product) }.buttonStyle(.borderedProminent).tint(ThusoTheme.brandInk)
            }
        }
        .padding(ThusoSpacing.space16)
        .background(ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.card))
        .overlay(RoundedRectangle(cornerRadius: ThusoRadius.card).stroke(ThusoTheme.line))
    }

    private func kitCard(_ kit: ShopData.Kit) -> some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            ShopPicture(name: kit.image, alt: kit.alt)
            Text(kit.name).font(.thuso(.headline))
            Text(kit.does).font(.thuso(.subheadline)).foregroundStyle(.secondary)
            ForEach(kit.items, id: \.self) { id in
                if let item = ShopData.product(id) {
                    HStack {
                        Text(item.name).font(.thuso(.subheadline))
                        Spacer()
                        Text(Double(item.priceCents) / 100, format: .currency(code: ShopData.currency)).font(.thuso(.subheadline)).monospacedDigit()
                    }
                }
            }
            Divider()
            HStack {
                Text("The kit comes to").font(.thuso(.subheadline))
                Spacer()
                // Worked out from its items; a kit has no price of its own.
                Text(Double(ShopData.priceCents(of: kit)) / 100, format: .currency(code: ShopData.currency)).font(.thuso(.title3, weight: .bold))
            }
            Button("Add \(kit.items.count) items") { kit.items.compactMap(ShopData.product).forEach(add) }
                .buttonStyle(.borderedProminent).tint(ThusoTheme.brandInk).frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(ThusoSpacing.space16)
        .background(ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.card))
        .overlay(RoundedRectangle(cornerRadius: ThusoRadius.card).stroke(ThusoTheme.line))
    }

    private var basketCard: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
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
                .buttonStyle(.borderedProminent).tint(ThusoTheme.brandInk).frame(maxWidth: .infinity)
            refusalLine("no-payment")
        }
        .padding(ThusoSpacing.space16)
        .background(ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.card))
        .overlay(RoundedRectangle(cornerRadius: ThusoRadius.card).stroke(ThusoTheme.line))
    }

    private var pointsPanel: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            ForEach(RewardsData.earnReasons.filter { $0.track == "household" }) { reason in
                VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
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
                .padding(ThusoSpacing.space16)
                .background(ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.card))
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
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            Text("What this shop will not do").font(.thuso(.headline))
            ForEach(ShopData.refusals) { Text($0.sentence).thusoFont(ThusoType.caption).foregroundStyle(.secondary) }
            ForEach(RewardsData.refusals) { Text($0.sentence).thusoFont(ThusoType.caption).foregroundStyle(.secondary) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, ThusoSpacing.space8)
    }

    private func chip(_ label: String, id: String) -> some View {
        Button(label) { category = id }
            .buttonStyle(.bordered)
            .tint(category == id ? ThusoTheme.brandGreen : ThusoTheme.faint)
            .accessibilityAddTraits(category == id ? .isSelected : [])
    }

    /// Rendered from the contract by id. A sentence typed here would be a fourth copy.
    private func refusalLine(_ id: String, emphasised: Bool = false) -> some View {
        Text(ShopData.refusal(id)?.sentence ?? RewardsData.refusal(id)?.sentence ?? "")
            .thusoFont(ThusoType.caption)
            .foregroundStyle(emphasised ? .primary : .secondary)
            .padding(emphasised ? ThusoSpacing.space12 : 0)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(emphasised ? ThusoTheme.mangoSoft : .clear, in: RoundedRectangle(cornerRadius: ThusoRadius.control))
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

/// A generated product photograph in its 4:3 frame, with the contract's label on it.
struct ShopPicture: View {
    let name: String
    let alt: String
    var body: some View {
        Image(name)
            .resizable()
            .aspectRatio(4.0 / 3.0, contentMode: .fit)
            .frame(maxWidth: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: ThusoRadius.tile))
            .overlay(alignment: .bottomLeading) {
                Text(ShopData.imageLabel)
                    .thusoFont(ThusoType.caption)
                    .foregroundStyle(ThusoTheme.ink)
                    .padding(.horizontal, ThusoSpacing.space8).padding(.vertical, ThusoSpacing.space4)
                    .background(ThusoTheme.surface.opacity(0.9), in: Capsule())
                    .padding(ThusoSpacing.space8)
                    .accessibilityHidden(true)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(alt) \(ShopData.imageLabel).")
    }
}

/// What a product reads, as words. A measure the record does not hold is said in its own sentence on the detail screen.
struct ShopReadings: View {
    let product: ShopData.Product
    var body: some View {
        let words = product.detail.readings + (product.detail.connection == "bluetooth" ? ["Bluetooth"] : product.detail.connection == "typed" ? ["Typed in"] : [])
        if !words.isEmpty {
            Text(words.joined(separator: " · "))
                .thusoFont(ThusoType.caption, weight: .semibold)
                .foregroundStyle(ThusoTheme.brandInk)
                .accessibilityLabel("Reads: \(words.joined(separator: ", "))")
        }
    }
}

/// A product, opened: the picture, the price against its reference, and who sees what.
struct ShopProductView: View {
    let product: ShopData.Product
    let add: () -> Void

    var body: some View {
        let detail = product.detail
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                ShopPicture(name: detail.image, alt: detail.alt)
                Text(product.name).font(.thuso(.title2, weight: .semibold))
                Text(product.does).font(.thuso(.body)).foregroundStyle(.secondary)
                HStack(alignment: .firstTextBaseline) {
                    Text(Double(product.priceCents) / 100, format: .currency(code: ShopData.currency)).font(.thuso(.title, weight: .bold))
                    Spacer()
                    Button("Add to basket", action: add).buttonStyle(.borderedProminent).tint(ThusoTheme.brandInk)
                }
                Text("Reference price \(Double(detail.referenceLowCents) / 100, format: .currency(code: ShopData.currency))–\(Double(detail.referenceHighCents) / 100, format: .currency(code: ShopData.currency)) at \(detail.referenceFrom), checked \(detail.referenceChecked).")
                    .thusoFont(ThusoType.caption).foregroundStyle(.secondary)
                Text(detail.regulatory).thusoFont(ThusoType.caption)
                if detail.connection == "bluetooth" { line("pairing-simulated") }
                if !detail.readings.isEmpty {
                    section("The readings it takes") { Text(detail.readings.joined(separator: " · ")).font(.thuso(.subheadline, weight: .semibold)) }
                }
                ForEach(detail.outsideRecord, id: \.self) { Text($0).thusoFont(ThusoType.caption).foregroundStyle(.secondary) }
                if product.needsReading { line("reading-is-not-advice") }
                seen("What you see", detail.patient)
                seen("What your nurse sees", detail.nurse)
                seen("What your doctor sees", detail.doctor)
                section("What it has") { ForEach(detail.features, id: \.self) { Text("• \($0)").font(.thuso(.subheadline)) } }
                section("Who it is for") { Text(detail.forWhom).font(.thuso(.subheadline)) }
                section("What it is not") {
                    ForEach(detail.whatItIsNot, id: \.self) { Text("• \($0)").font(.thuso(.subheadline)) }
                    line("no-claim")
                }
            }
            .padding(ThusoSpacing.space20)
        }
        .background(ThusoTheme.studioPaper)
        .navigationTitle(product.name)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func line(_ id: String) -> some View {
        Text(ShopData.refusal(id)?.sentence ?? "").thusoFont(ThusoType.caption).foregroundStyle(.secondary)
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            Text(title).font(.thuso(.headline)).accessibilityAddTraits(.isHeader)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(ThusoSpacing.space16)
        .background(ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.card))
    }

    /// Each line says in a word whether this preview does it, never by colour alone.
    private func seen(_ title: String, _ lines: [ShopData.Seen]) -> some View {
        section(title) {
            if lines.isEmpty {
                Text("Nothing through MyThuso from this device.").font(.thuso(.subheadline)).foregroundStyle(.secondary)
            }
            ForEach(lines, id: \.self) { item in
                VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                    Text(item.text).font(.thuso(.subheadline))
                    Text(item.planned ? "Planned" : "In this preview")
                        .thusoFont(ThusoType.caption, weight: .semibold)
                        .foregroundStyle(item.planned ? ThusoTheme.faint : ThusoTheme.brandInk)
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
}
