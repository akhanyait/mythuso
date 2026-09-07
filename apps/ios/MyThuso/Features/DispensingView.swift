import SwiftUI

/* Substitution and chronic authorisation, for the pharmacist.

   A pharmacist hands over something other than what was written. A repeat runs out. Both are the
   most ordinary events in a pharmacy, and both are where harm hides, so this screen is built out of
   the distinctions that ordinariness erodes:

     A substitution is a clinical decision, not a stock decision. An empty shelf is a reason to
     think about an alternative; it is never on its own a reason to hand one over. Every item says
     which of the three classes it is in and on what ground, and an item that must not be
     substituted carries no control at all — not a disabled one. A button that refuses is still a
     button somebody will look for a way around, and there is nothing here to work around.

     The patient is told, in words, before they accept it. Nothing can be marked handed over until
     the words have actually been shown, which is a gate rather than a reminder.

     Who decided. Every substituted item carries the pharmacist's name and SAPC registration, the
     same way a clinical sign-off does.

     The authorisation is boxed twice, by a date and by a number of repeats, and it ends on
     whichever arrives first. Both boxes are arithmetic on the contract, done in Dispensing.swift.

   Two refusals here belong to the vetting register and are quoted rather than restated: a pharmacy
   whose responsible pharmacist is not current cannot be dispensed to, and a doctor whose
   registration has lapsed cannot stand behind the prescription. A second sentence about the same
   refusal is a second sentence to keep in step.

   Nothing is dispensed. No pharmacy is contacted and every patient, pharmacist and product is
   fictional. */

private let dispensingPharmacies = ["P-501", "P-502"]
private let dispensingPrescribers = ["D-401", "D-402"]
private let dispensingDay = Date.FormatStyle().day().month(.wide).year()

struct DispensingView: View {
    @ObservedObject private var vetting = VettingStore.shared
    @State private var pharmacyId = dispensingPharmacies[0]
    @State private var prescriberId = dispensingPrescribers[0]
    @State private var told: Set<String> = []
    @State private var handed: Set<String> = []
    @State private var collectTried = false

    private var pharmacy: VettingSubject? { vetting.subject(pharmacyId) }
    private var prescriber: VettingSubject? { vetting.subject(prescriberId) }
    private var mayDispense: VettingDecision? { pharmacy.map { can($0, "dispense") } }
    private var mayPrescribe: VettingDecision? { prescriber.map { can($0, "prescribe") } }
    private var open: Bool { (mayDispense?.allowed ?? false) && (mayPrescribe?.allowed ?? false) }
    private var everyItemTold: Bool { Dispensing.prescription.items.allSatisfy { told.contains($0.id) } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                DemoBadge()
                CareHeading(eyebrow: "Partner workspace", title: "Substitution & repeats",
                            subtitle: "A fictional prescription. Nothing is dispensed and no pharmacy is contacted.")
                header
                parties
                boundary
                classes
                items
                handover
                authorisation
                refusals
            }
            .padding(18)
        }
        .background(ThusoTheme.canvas)
        .navigationTitle("Substitution & repeats").navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Who is behind it

    private var header: some View {
        CareCard {
            Text(Dispensing.prescription.reference)
                .font(.system(size: 21, weight: .bold)).foregroundStyle(ThusoTheme.ink)
            Text("\(Dispensing.prescription.patient) · \(Dispensing.prescription.patientBorn) · issued \(Dispensing.prescription.issued.formatted(dispensingDay))")
                .font(.footnote).foregroundStyle(ThusoTheme.body)
            row("Prescribed by", attributedTo(prescriberId))
            row("Dispensed by", "\(Dispensing.prescription.pharmacist.name) · \(Dispensing.prescription.pharmacist.registration)")
            row("At", attributedTo(pharmacyId))
        }
    }

    /* Both answers come from the vetting register in its own words. A licence and a registration are
       not badges on a partner page; they are what decides whether anything here does anything. */
    private var parties: some View {
        VStack(alignment: .leading, spacing: 11) {
            Picker("Dispensing pharmacy", selection: $pharmacyId) {
                ForEach(dispensingPharmacies, id: \.self) { id in
                    Text(vetting.subject(id)?.name ?? id).tag(id)
                }
            }
            Picker("Prescriber", selection: $prescriberId) {
                ForEach(dispensingPrescribers, id: \.self) { id in
                    Text(vetting.subject(id)?.name ?? id).tag(id)
                }
            }
            if let decision = mayDispense, !decision.allowed {
                alert(decision.reason ?? "", symbol: "shield.slash")
            }
            if let decision = mayPrescribe, !decision.allowed {
                alert(decision.reason ?? "", symbol: "stethoscope")
            }
        }
    }

    // MARK: - The boundary and the three classes

    private var boundary: some View {
        VStack(alignment: .leading, spacing: 11) {
            heading("What a substitution may and may not change")
            CareCard {
                Text("Never, without the prescriber").font(.system(size: 11.5, weight: .bold))
                    .textCase(.uppercase).foregroundStyle(ThusoTheme.faint)
                ForEach(Dispensing.neverChanges) { change in bullet(change.what, change.why) }
                Divider()
                Text("May change, and the patient is told").font(.system(size: 11.5, weight: .bold))
                    .textCase(.uppercase).foregroundStyle(ThusoTheme.faint)
                ForEach(Dispensing.mayChange) { change in bullet(change.what, change.why) }
                refusal(Dispensing.refusal("substitute-the-molecule"))
            }
        }
    }

    private var classes: some View {
        VStack(alignment: .leading, spacing: 11) {
            heading("The three classes")
            ForEach(Dispensing.substitutionClasses) { klass in
                CareCard {
                    StatusPill(text: klass.shortName, tone: klass.tone)
                    Text(klass.name).font(.system(size: 14.5, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
                    Text(klass.detail).font(.system(size: 12.5)).foregroundStyle(ThusoTheme.body)
                    Text(klass.whoDecides).font(.footnote).foregroundStyle(ThusoTheme.faint)
                }
            }
            Text("There is no fourth class called “may be substituted”. Section 22F of the Medicines and Related Substances Act 101 of 1965 makes telling the patient a duty on every substitution, with four exceptions — \(Dispensing.statutoryGrounds.map { "\($0.name.lowercased()) (\($0.section ?? ""))" }.joined(separator: ", ")) — so a silent swap is not the mild end of this screen. It is outside it.")
                .font(.footnote).foregroundStyle(ThusoTheme.body)
        }
    }

    // MARK: - The items

    private var items: some View {
        VStack(alignment: .leading, spacing: 11) {
            heading("\(Dispensing.prescription.items.count) items · \(Dispensing.prescription.substituted.count) substituted")
            Text(Dispensing.rule("substitution-is-clinical").sentence)
                .font(.system(size: 12.5)).foregroundStyle(ThusoTheme.body)
            ForEach(Dispensing.prescription.items) { item in itemCard(item) }
            Text(Dispensing.rule("patient-is-told-first").sentence)
                .font(.system(size: 12.5)).foregroundStyle(ThusoTheme.body)
            Text(Dispensing.rule("substitution-is-signed").sentence)
                .font(.system(size: 12.5)).foregroundStyle(ThusoTheme.body)
        }
    }

    private func itemCard(_ item: PrescriptionItem) -> some View {
        let klass = Dispensing.substitutionClass(item.classId)
        let ground = Dispensing.ground(item.ground)
        let isTold = told.contains(item.id)
        return CareCard {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.dispensed).font(.system(size: 14.5, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
                    Text("\(item.molecule) \(item.strength) · \(item.form) · \(item.dose) · \(item.quantity)")
                        .font(.system(size: 12)).foregroundStyle(ThusoTheme.body)
                }
                Spacer(minLength: 8)
                StatusPill(text: klass.shortName, tone: klass.tone)
            }
            Text(item.wasSubstituted ? "Written: \(item.prescribed)" : "Written and dispensed: \(item.prescribed)")
                .font(.system(size: 12.5)).foregroundStyle(ThusoTheme.body)
            groundLine(ground)
            if let second = item.secondGround { groundLine(Dispensing.ground(second)) }
            Text(klass.whoDecides).font(.footnote).foregroundStyle(ThusoTheme.faint)

            /* An item that must not be substituted carries no control. The refusal is the absence,
               and the sentence says where the route actually is. */
            if item.classId == "must-not" { refusal(Dispensing.refusal("override-do-not-substitute")) }

            if let reason = item.writtenReason {
                VStack(alignment: .leading, spacing: 5) {
                    Text("\(Dispensing.prescription.pharmacist.name) · \(Dispensing.prescription.pharmacist.registration)")
                        .font(.system(size: 13, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
                    Text("\(Dispensing.prescription.pharmacist.role) · the prescriber was told the same day")
                        .font(.system(size: 11.5)).foregroundStyle(ThusoTheme.faint)
                    Text(reason).font(.system(size: 12.5)).foregroundStyle(ThusoTheme.body)
                }
                .padding(13).frame(maxWidth: .infinity, alignment: .leading)
                .background(ThusoTheme.canvas, in: RoundedRectangle(cornerRadius: 14))
            }

            Button(isTold ? "Hide what was said to the patient" : "Read this to the patient") {
                if isTold { told.remove(item.id) } else { told.insert(item.id) }
            }
            .buttonStyle(QuietButton())

            if isTold { telling(item) }

            Toggle(isOn: Binding(
                get: { handed.contains(item.id) },
                set: { on in if on { handed.insert(item.id) } else { handed.remove(item.id) } }
            )) {
                Text(isTold ? "Handed over" : "Nothing is handed over before the patient has been told what it is")
                    .font(.system(size: 12.5)).foregroundStyle(isTold ? ThusoTheme.ink : ThusoTheme.faint)
            }
            .disabled(!isTold || !open)
            Text(item.note).font(.footnote).foregroundStyle(ThusoTheme.faint)
        }
    }

    /* The words. Not a label on a box — sentences a person can repeat to somebody else at home, so
       they are set as speech rather than as small print. */
    private func telling(_ item: PrescriptionItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(Dispensing.headline(item), systemImage: "ear")
                .font(.system(size: 12, weight: .bold)).foregroundStyle(ThusoTheme.indigo)
            if item.wasSubstituted {
                Text("It replaces \(item.prescribed).").font(.system(size: 12.5)).foregroundStyle(ThusoTheme.indigo)
            }
            Text(item.patientWords).font(.system(size: 15)).foregroundStyle(ThusoTheme.slate)
            if !item.sameness.isEmpty {
                Text("The same").font(.system(size: 11.5, weight: .bold)).textCase(.uppercase).foregroundStyle(ThusoTheme.faint)
                ForEach(item.sameness, id: \.self) { line in
                    Text("• \(line)").font(.system(size: 12.5)).foregroundStyle(ThusoTheme.body)
                }
                Text("Different").font(.system(size: 11.5, weight: .bold)).textCase(.uppercase).foregroundStyle(ThusoTheme.faint)
                ForEach(item.differences, id: \.self) { line in
                    Text("• \(line)").font(.system(size: 12.5)).foregroundStyle(ThusoTheme.body)
                }
            }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(ThusoTheme.indigoSoft, in: RoundedRectangle(cornerRadius: 14))
    }

    private var handover: some View {
        VStack(alignment: .leading, spacing: 11) {
            heading("The handover")
            CareCard {
                ForEach(Array(Dispensing.handover.enumerated()), id: \.element.id) { index, step in
                    let done = open && (index < 2 || (step.id == "told" && everyItemTold)
                        || (step.id == "recorded" && handed.count == Dispensing.prescription.items.count))
                    HStack(alignment: .top, spacing: 11) {
                        Image(systemName: done ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(done ? ThusoTheme.indigo : .gray.opacity(0.5))
                        VStack(alignment: .leading, spacing: 3) {
                            Text(step.label).font(.system(size: 13.5, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
                            Text(step.detail).font(.system(size: 12)).foregroundStyle(ThusoTheme.body)
                        }
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    // MARK: - The authorisation

    private var authorisation: some View {
        let auth = Dispensing.authorisation
        let answer = Dispensing.collectionAnswer
        return VStack(alignment: .leading, spacing: 11) {
            heading("The chronic authorisation")
            CareCard {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(auth.reference).font(.system(size: 17, weight: .bold)).foregroundStyle(ThusoTheme.ink)
                        Text("\(auth.programme) · \(auth.condition)").font(.system(size: 12)).foregroundStyle(ThusoTheme.body)
                    }
                    Spacer(minLength: 8)
                    StatusPill(text: "\(Dispensing.repeatsRemaining) of \(auth.repeatsAuthorised) left",
                               tone: Dispensing.bindsOnDate ? "amber" : "teal")
                }
                box("Runs out on", Dispensing.expiresOn.formatted(dispensingDay),
                    "\(Dispensing.expiresInDays) days from today · authorised \(Dispensing.authorisedOn.formatted(dispensingDay)) for \(auth.validMonths) months")
                box("Medicine still authorised", "\(Dispensing.daysOfMedicineLeft) days",
                    "\(Dispensing.repeatsRemaining) repeats of \(auth.daysPerRepeat) days")
                box("Ends on", Dispensing.bindsOnDate ? "the date" : "the repeats",
                    Dispensing.strandedRepeats > 0
                        ? "Whichever comes first — \(Dispensing.strandedRepeats) of the repeats cannot be collected before it expires"
                        : "Whichever comes first")
                Text(auth.note).font(.footnote).foregroundStyle(ThusoTheme.body)
                Text(auth.quantityNote).font(.footnote).foregroundStyle(ThusoTheme.body)
                Text(Dispensing.rule("authorisation-is-boxed").sentence)
                    .font(.system(size: 12.5)).foregroundStyle(ThusoTheme.body)
                row("Last collected", Dispensing.lastCollectedOn.formatted(dispensingDay))
                row("Next collection due", Dispensing.nextCollectionOn.formatted(dispensingDay))
                Button("Collect a repeat") { collectTried = true }.buttonStyle(CareButton()).disabled(!open)
                if collectTried {
                    if answer.allowed {
                        Text(answer.reason).font(.system(size: 12.5)).foregroundStyle(ThusoTheme.slate)
                    } else {
                        alert(answer.reason, symbol: "calendar.badge.clock")
                        Text(Dispensing.rule("early-is-refused-with-a-date").sentence)
                            .font(.system(size: 12.5)).foregroundStyle(ThusoTheme.body)
                    }
                }
                if Dispensing.isFinalRepeat {
                    alert("This is the last repeat. It is said now, not at the counter next month.", symbol: "exclamationmark.circle")
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text("What happens at the end").font(.system(size: 13.5, weight: .semibold)).foregroundStyle(ThusoTheme.slate)
                    Text(auth.endsWith).font(.system(size: 12.5)).foregroundStyle(ThusoTheme.slate)
                    Text(Dispensing.rule("ends-in-a-review").sentence).font(.system(size: 12.5)).foregroundStyle(ThusoTheme.slate)
                }
                .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                .background(ThusoTheme.indigoSoft, in: RoundedRectangle(cornerRadius: 14))
            }
        }
    }

    private var refusals: some View {
        VStack(alignment: .leading, spacing: 11) {
            heading("What this screen will not do")
            ForEach(Dispensing.refusals) { item in CareCard { refusal(item) } }
            Text("Nothing is dispensed, no stock is checked and no prescriber is notified. Every date above is arithmetic on the demo contract, and none of the clinical wording here has been read by a pharmacist.")
                .font(.footnote).foregroundStyle(ThusoTheme.faint)
        }
    }

    // MARK: - Small parts

    private func heading(_ text: String) -> some View {
        Text(text).font(.system(size: 17, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top) {
            Text(label).font(.system(size: 13)).foregroundStyle(ThusoTheme.body)
            Spacer(minLength: 8)
            Text(value).font(.system(size: 13, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
                .multilineTextAlignment(.trailing)
        }
    }

    private func box(_ label: String, _ value: String, _ note: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label).font(.system(size: 11, weight: .bold)).textCase(.uppercase).foregroundStyle(ThusoTheme.faint)
            Text(value).font(.system(size: 18, weight: .bold)).foregroundStyle(ThusoTheme.ink)
            Text(note).font(.system(size: 11.5)).foregroundStyle(ThusoTheme.body)
        }
        .padding(13).frame(maxWidth: .infinity, alignment: .leading)
        .background(ThusoTheme.canvas, in: RoundedRectangle(cornerRadius: 14))
    }

    private func bullet(_ what: String, _ why: String) -> some View {
        HStack(alignment: .top, spacing: 9) {
            Text("•").foregroundStyle(ThusoTheme.indigo)
            VStack(alignment: .leading, spacing: 2) {
                Text(what).font(.system(size: 13, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
                Text(why).font(.system(size: 12)).foregroundStyle(ThusoTheme.body)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func groundLine(_ ground: SubstitutionGround) -> some View {
        HStack(alignment: .top, spacing: 9) {
            Image(systemName: "info.circle").font(.system(size: 14)).foregroundStyle(ThusoTheme.indigo)
            VStack(alignment: .leading, spacing: 3) {
                Text(ground.section == nil ? ground.name : "\(ground.name) · section \(ground.section ?? "")")
                    .font(.system(size: 12.5, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
                Text(ground.detail).font(.system(size: 12.5)).foregroundStyle(ThusoTheme.body)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func alert(_ text: String, symbol: String) -> some View {
        HStack(alignment: .top, spacing: 11) {
            Image(systemName: symbol).font(.system(size: 16)).foregroundStyle(ThusoTheme.mangoInk)
            Text(text).font(.system(size: 12.5)).foregroundStyle(ThusoTheme.slate)
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(ThusoTheme.mangoSoft, in: RoundedRectangle(cornerRadius: 14))
    }

    private func refusal(_ item: DispensingRefusal) -> some View {
        HStack(alignment: .top, spacing: 11) {
            Image(systemName: "nosign").font(.system(size: 16)).foregroundStyle(ThusoTheme.danger)
            Text(item.sentence).font(.system(size: 12.5)).foregroundStyle(ThusoTheme.slate)
        }
    }
}
