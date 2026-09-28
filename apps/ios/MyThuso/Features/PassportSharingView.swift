import SwiftUI
import CoreImage
import UIKit

/* Two screens of the Health Passport's P1 on iOS: the emergency card, and who opened the record.
 *
 * Ported from apps/web/src/features/PassportSharing.tsx. Every word is PassportSharingData's, generated from
 * packages/catalog/passport-sharing.json and the gateway's own sentences, and every end and number of opens is a
 * generated default worked out by Models/PassportSharing.swift — no screen here types how long a card lasts or how
 * often it opens. Each screen says it is a preview before anything else, because a card with a QR code on it is
 * exactly the thing somebody could mistake for the real one.
 *
 * THE QR CODE is CoreImage's CIQRCodeGenerator, which ships with iOS: no dependency, and error correction M, the
 * level the web and Android encoders draw at. PRINTING is UIPrintInteractionController with the card rendered as
 * an image — the same card the screen shows, preview sentence first.
 */

// MARK: - The emergency card

struct EmergencyCardView: View {
    @State private var card: EmergencyCardTerms?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space20) {
                DemoBadge()
                SurfaceHeading(eyebrow: PassportSharingData.Card.eyebrow, title: PassportSharingData.Card.title, subtitle: PassportSharingData.Card.intro)
                PreviewSentence(text: PassportSharingData.Card.preview)
                if let card {
                    EmergencyCardFace(card: card)
                    Button { EmergencyCardPrinter.print(card) } label: {
                        Label(PassportSharingData.Card.print, systemImage: "printer")
                    }.buttonStyle(QuietButton())
                } else {
                    CareCard {
                        Text(PassportSharing.fill(PassportSharingData.Card.ridesOn, [
                            "recipient": PassportSharingData.cardRecipient,
                            "when": Scheduling.longDate(PassportSharing.day(PassportSharingData.cardGrantEndsInDays))
                        ])).font(.thuso(.subheadline)).fixedSize(horizontal: false, vertical: true)
                        Text(EmergencyCardFace.opensOnly).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                        Text(PassportSharingData.settingsNote).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Button(PassportSharingData.Card.make) { card = PassportSharing.makeCard() }.buttonStyle(CareButton())
                }
                CareCard(padding: ThusoSpacing.space16, spacing: 0) {
                    NavigationLink { PassportAccessLogView() } label: {
                        MenuRow(title: PassportSharingData.Log.title, subtitle: PassportSharingData.Log.intro, symbol: "list.bullet.rectangle")
                    }.buttonStyle(.plain)
                }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle(PassportSharingData.Card.route)
    }
}

/// The preview sentence, drawn first on every P1 screen.
private struct PreviewSentence: View {
    let text: String
    var body: some View {
        Label { Text(text).font(.thuso(.footnote, weight: .semibold)).fixedSize(horizontal: false, vertical: true) } icon: {
            Image(systemName: "shield.lefthalf.filled").accessibilityHidden(true)
        }
        .foregroundStyle(ThusoRole.foreground)
        .accessibilityElement(children: .combine)
    }
}

enum EmergencyCardQR {
    /* CIQRCodeGenerator at correction level M, scaled up without smoothing so each module stays a square. */
    static func image(for payload: String, scale: CGFloat = 10) -> UIImage? {
        guard let filter = CIFilter(name: "CIQRCodeGenerator") else { return nil }
        filter.setValue(Data(payload.utf8), forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: scale, y: scale)),
              let drawn = CIContext().createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: drawn)
    }
}

struct EmergencyCardFace: View {
    let card: EmergencyCardTerms
    static var opensOnly: String {
        PassportSharing.fill(PassportSharingData.Card.opensOnly, ["categories": PassportSharingData.emergencySummaryNames.joined(separator: ", ")])
    }

    var body: some View {
        CareCard(padding: ThusoSpacing.space16) {
            HStack(alignment: .firstTextBaseline) {
                Text(PassportSharingData.Card.title).font(.thuso(.headline)).accessibilityAddTraits(.isHeader)
                Spacer(minLength: ThusoSpacing.space8)
                MetricChip(text: String(PassportSharingData.Card.preview.prefix { $0 != "." }), flagged: true)
            }
            Text(PassportSharingData.Card.preview).font(.thuso(.footnote, weight: .semibold)).fixedSize(horizontal: false, vertical: true)
            if let image = EmergencyCardQR.image(for: card.payload) {
                Image(uiImage: image).interpolation(.none).resizable().scaledToFit()
                    .frame(maxWidth: 220)
                    .padding(ThusoSpacing.space12)
                    .background(Color.white)
                    .accessibilityLabel(PassportSharingData.Card.qrLabel)
            }
            Text(PassportSharingData.Card.code).thusoFont(ThusoType.caption, weight: .semibold).foregroundStyle(ThusoRole.mutedForeground)
            Text(card.code).font(.thuso(.title3, weight: .semibold).monospaced()).foregroundStyle(ThusoRole.foreground)
            Text(Self.opensOnly).font(.thuso(.subheadline))
            Text(PassportSharingData.Card.sealedNever).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
            Text(PassportSharing.fill(PassportSharingData.Card.ends, ["when": Scheduling.longDate(card.endsOn)])).font(.thuso(.subheadline))
            Text(PassportSharing.fill(PassportSharingData.Card.opens, ["uses": String(card.usesAllowed)])).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
            Text(PassportSharing.fill(PassportSharingData.Card.ridesOn, ["recipient": card.recipient, "when": Scheduling.longDate(card.grantEndsOn)]))
                .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground).fixedSize(horizontal: false, vertical: true)
        }
    }
}

/* The printed card: white, black, the preview sentence first, and nothing a printer could lose to colour. */
private struct PrintableCard: View {
    let card: EmergencyCardTerms
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(PassportSharingData.Card.title).font(.thuso(.title2, weight: .bold))
            Text(PassportSharingData.Card.preview).font(.thuso(.body, weight: .semibold))
            if let image = EmergencyCardQR.image(for: card.payload) {
                Image(uiImage: image).interpolation(.none).resizable().scaledToFit().frame(width: 220, height: 220)
            }
            Text("\(PassportSharingData.Card.code): \(card.code)").font(.thuso(.title3).monospaced())
            Text(EmergencyCardFace.opensOnly)
            Text(PassportSharingData.Card.sealedNever)
            Text(PassportSharing.fill(PassportSharingData.Card.ends, ["when": Scheduling.longDate(card.endsOn)]))
            Text(PassportSharing.fill(PassportSharingData.Card.opens, ["uses": String(card.usesAllowed)]))
        }
        .foregroundStyle(Color.black)
        .padding(24)
        .frame(width: 540, alignment: .leading)
        .background(Color.white)
    }
}

enum EmergencyCardPrinter {
    @MainActor static func print(_ card: EmergencyCardTerms) {
        let renderer = ImageRenderer(content: PrintableCard(card: card))
        renderer.scale = 2
        guard let image = renderer.uiImage else { return }
        let info = UIPrintInfo(dictionary: nil)
        info.outputType = .general
        info.jobName = PassportSharingData.Card.title
        let controller = UIPrintInteractionController.shared
        controller.printInfo = info
        controller.printingItem = image
        controller.present(animated: true)
    }
}

// MARK: - Who opened the record

struct PassportAccessLogView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                DemoBadge()
                SurfaceHeading(eyebrow: PassportSharingData.Log.eyebrow, title: PassportSharingData.Log.title, subtitle: PassportSharingData.Log.intro)
                PreviewSentence(text: PassportSharingData.Log.preview)
                Text(PassportSharingData.Log.chain).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
                Text(PassportSharingData.Log.newest).font(.thuso(.headline)).accessibilityAddTraits(.isHeader)
                if PassportSharing.log.isEmpty {
                    Text(PassportSharingData.Log.empty).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.mutedForeground)
                }
                ForEach(PassportSharing.log) { entry in
                    CareCard(spacing: ThusoSpacing.space8) {
                        Text(entry.action).font(.thuso(.headline))
                        HStack(spacing: ThusoSpacing.space8) {
                            MetricChip(text: entry.outcomeLabel, flagged: entry.outcome != "granted")
                            if entry.breakGlass { MetricChip(text: PassportSharingData.Log.breakGlass, flagged: true) }
                        }
                        Text(line(entry)).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground).fixedSize(horizontal: false, vertical: true)
                        Text(entry.reason).font(.thuso(.subheadline)).fixedSize(horizontal: false, vertical: true)
                        if let hours = entry.reviewDueInHours {
                            let due = Calendar.current.date(byAdding: .hour, value: hours, to: PassportSharing.day(entry.dayOffset)) ?? PassportSharing.day(entry.dayOffset)
                            Text(PassportSharing.fill(PassportSharingData.Log.reviewDue, ["when": Scheduling.longDate(due)])).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                        }
                    }
                }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle(PassportSharingData.Log.route)
    }

    private func line(_ entry: PassportSharingData.LogEntry) -> String {
        let purpose = entry.purpose.map { " · " + PassportSharing.fill(PassportSharingData.Log.purpose, ["purpose": $0]) } ?? ""
        return "\(entry.who) · \(Scheduling.longDate(PassportSharing.day(entry.dayOffset))) · \(entry.time)\(purpose)"
    }
}
