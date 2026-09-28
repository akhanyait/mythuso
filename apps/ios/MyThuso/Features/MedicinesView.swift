import SwiftUI
import Combine

/* The hand-over of a sealed medicine bag at a patient's door, as the nurse who holds it.
 *
 * Every word on this screen that is not about the preview itself is MedicinesData.swift, generated from the
 * contract, and every rule is Medicines.swift. The screen adds three things of its own, each for a reason:
 *
 *   The patient's phone. A collector does not know the PIN, and a reviewer walking the journey has nobody to
 *   ask, so a synthetic patient stands on this device and is shown the PIN once. The card says it is synthetic,
 *   because a PIN printed beside the field it unlocks is exactly what the real screen must never look like.
 *
 *   The seal is chosen, not assumed. Neither answer is selected when the screen opens, so a nurse cannot hand a
 *   bag over without having said what she saw.
 *
 *   A fresh bag each time the screen opens. The collection lives in the view's own state and nowhere else: a
 *   voided bag goes back to the pharmacy, and the only way to try again is the way the contract gives, a new
 *   authorisation, which here is leaving and coming back.
 *
 * Nothing is collected and no pharmacy is contacted; the capability notice for medicine collection says so in
 * the contract's words.
 */
final class MedicinesHandoverDesk: ObservableObject {
    /* The nurse the workspace opens as. She is the collector the synthetic patient authorised, so the refusals a
       reviewer meets are the ones a real collector would, not "not-the-authorised-collector" on every tap. */
    static let collector = Medicines.Caller(ref: "N-205", role: "nurse")

    @Published private(set) var prescription: Medicines.Prescription
    let authorisation: Medicines.Authorisation
    @Published private(set) var collection: Medicines.CollectionRecord?
    @Published private(set) var attempts: [Medicines.Attempt] = []
    @Published private(set) var patientPin: String?
    @Published private(set) var refusal: MedicinesRefusal?

    init() {
        let now = Date()
        /* A schedule a driver may not carry, when the contract has one: the nurse is the collector who may, and
           a reviewer sees why the patient chose a nurse rather than a courier for this bag. */
        let schedule = Medicines.schedules.first { !$0.driverMayCarry } ?? Medicines.schedules[0]
        let sealed = Medicines.Prescription(prescriptionRef: "RX-SYN-" + Medicines.newSalt().prefix(6).uppercased(),
                                            subjectRef: "P-SYNTHETIC", scheduleCode: schedule.id,
                                            dispensedAt: now, sealRef: "SEAL-" + Medicines.newSalt().prefix(8).uppercased())
        let pin = Medicines.newPin()
        prescription = sealed
        authorisation = Medicines.authorise(sealed, authorisationRef: "AUTH-" + Medicines.newSalt().prefix(8).uppercased(),
                                            collectorRef: Self.collector.ref ?? "", collectorRole: Self.collector.role,
                                            pin: pin, terms: .defaults, now: now)
        patientPin = pin
    }

    var state: String { Medicines.custodyState(collection, attempts, authorisation) }
    var attemptsLeft: Int { Medicines.attemptsLeft(attempts, authorisation) }
    var handedOver: Bool { collection?.handedOverAt != nil }

    func collect() {
        switch Medicines.collect(prescription, authorisation, existing: collection,
                                 collectionRef: "COL-" + Medicines.newSalt().prefix(8).uppercased(),
                                 sealRef: prescription.sealRef ?? "", who: Self.collector, now: Date()) {
        case .done(let custody):
            collection = custody.collection
            prescription = custody.prescription
            refusal = nil
        case .refused(let refused):
            refusal = refused
        }
    }

    /// The nurse enters the PIN the patient reads to her. The patient's screen forgets it as she does, as a PIN shown once must.
    func handOver(pin: String, sealIntact: Bool) {
        patientPin = nil
        guard let collection else { refusal = Medicines.refusal("no-such-collection"); return }
        let handed = Medicines.handOver(collection, prescription, authorisation, attempts: attempts,
                                        pinMatches: Medicines.pinMatches(pin, authorisation), sealIntact: sealIntact,
                                        who: Self.collector, now: Date())
        if let keep = handed.keep { attempts.append(keep) }
        switch handed.result {
        case .done(let custody):
            self.collection = custody.collection
            prescription = custody.prescription
            refusal = nil
        case .refused(let refused):
            refusal = refused
        }
    }
}

struct MedicinesView: View {
    @StateObject private var desk = MedicinesHandoverDesk()
    @State private var pin = ""
    @State private var sealIntact: Bool?

    private var ready: Bool { pin.count == Medicines.pinDigits && sealIntact != nil }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                DemoBadge()
                SurfaceHeading(title: Medicines.HandoverText.heading, subtitle: Medicines.HandoverText.intro)
                CapabilityNotice(of: "medicine-collection")
                patientPhone
                bag
                if desk.collection != nil && !desk.handedOver { handOverForm }
                if desk.handedOver {
                    SurfacePanel(tone: .lead) {
                        Label(Medicines.HandoverText.handedOver, systemImage: "checkmark.seal")
                            .thusoFont(ThusoType.cardTitle, weight: .semibold).foregroundStyle(ThusoRole.foreground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .accessibilityIdentifier("medicines-handed-over")
                }
            }
            .padding(ThusoSpacing.space16)
        }
        .thusoGround()
        .navigationTitle(Medicines.HandoverText.heading).navigationBarTitleDisplayMode(.inline)
    }

    /* Quiet ground, a phone symbol and the word synthetic in its first line: it is somebody else's screen
       standing in this one, and it must not read as part of the collector's. */
    private var patientPhone: some View {
        SurfacePanel(tone: .quiet, spacing: ThusoSpacing.space8) {
            Label("The patient's phone · synthetic, in this preview", systemImage: "iphone")
                .font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
            if let shown = desk.patientPin {
                Text(shown).font(.thuso(.title2, weight: .semibold).monospacedDigit()).foregroundStyle(ThusoRole.foreground)
                    .accessibilityIdentifier("medicines-patient-pin")
            }
            Text(desk.patientPin == nil
                 ? "Shown once, and gone now. A synthetic patient, on this device so the hand-over can be walked."
                 : "A synthetic patient, on this device so the hand-over can be walked. Shown once: it goes the moment a PIN is entered, and a real collector never sees it.")
                .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    private var bag: some View {
        SurfacePanel(spacing: ThusoSpacing.space8) {
            Text(Medicines.label(Medicines.custodyStates, desk.state))
                .thusoFont(ThusoType.caption, weight: .medium).foregroundStyle(ThusoRole.mutedForeground)
            Text([Medicines.schedule(desk.prescription.scheduleCode)?.name, desk.prescription.sealRef]
                    .compactMap { $0 }.joined(separator: " · "))
                .thusoFont(ThusoType.sectionTitle, weight: .semibold).foregroundStyle(ThusoRole.foreground).monospacedDigit()
                .fixedSize(horizontal: false, vertical: true)
            if let reason = Medicines.voidedBy(desk.attempts, desk.authorisation) {
                Text(Medicines.label(Medicines.voidReasons, reason))
                    .thusoFont(ThusoType.caption, weight: .medium).foregroundStyle(ThusoRole.dangerInk)
            }
            if desk.collection == nil {
                Button(Medicines.HandoverText.collect) { desk.collect() }
                    .buttonStyle(CareButton())
                    .accessibilityIdentifier("medicines-collect")
                if let refusal = desk.refusal { refusalLine(refusal) }
            }
        }
    }

    @ViewBuilder private var handOverForm: some View {
        SurfacePanel(spacing: ThusoSpacing.space12) {
            sealChoice(Medicines.HandoverText.sealIntact, intact: true)
            sealChoice(Medicines.HandoverText.sealBroken, intact: false)
            Text(Medicines.HandoverText.pin).thusoFont(ThusoType.cardTitle, weight: .medium).foregroundStyle(ThusoRole.foreground)
            CodeBoxes(code: $pin, length: Medicines.pinDigits, invalid: desk.refusal != nil, label: Medicines.HandoverText.pin)
            if desk.state == "collected" {
                Text(Medicines.fill(Medicines.HandoverText.attemptsLeft, ["left": String(desk.attemptsLeft)]))
                    .thusoFont(ThusoType.caption).foregroundStyle(ThusoRole.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let refusal = desk.refusal { refusalLine(refusal) }
        }
        Button(Medicines.HandoverText.handOver) {
            if let sealIntact { desk.handOver(pin: pin, sealIntact: sealIntact) }
            pin = ""
        }
        .buttonStyle(CareButton())
        .disabled(!ready)
        .accessibilityIdentifier("medicines-hand-over")
    }

    private func sealChoice(_ title: String, intact: Bool) -> some View {
        Button { sealIntact = intact } label: {
            HStack(spacing: ThusoSpacing.space12) {
                Image(systemName: sealIntact == intact ? "largecircle.fill.circle" : "circle")
                    .font(.thuso(.title3)).foregroundStyle(ThusoRole.foreground).accessibilityHidden(true)
                Text(title).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(sealIntact == intact ? [.isButton, .isSelected] : .isButton)
    }

    /* The refusal in the text ink and the danger colour only on the mark, so the words stay readable and the
       state is not carried by colour alone. */
    private func refusalLine(_ refusal: MedicinesRefusal) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
            Image(systemName: "hand.raised").foregroundStyle(ThusoRole.dangerInk).accessibilityHidden(true)
            Text(refusal.statement).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("medicines-refusal-\(refusal.id)")
    }
}
