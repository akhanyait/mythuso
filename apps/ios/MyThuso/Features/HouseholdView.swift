import SwiftUI

/* The household record, held as a FHIR Group and read by six different people. The rules it obeys
   are in Models/Household.swift; this file is what they look like on a phone.

   Nothing here is a security control. A gate drawn in SwiftUI gates nothing, and there is no server
   behind it. It is the design of one, and it is honest about what it refuses so that the refusals
   can be reviewed before they are built. */

struct HouseholdView: View {
    @EnvironmentObject private var store: PreviewStore
    @ObservedObject private var vetting = VettingStore.shared
    @State private var viewerId = "v-thando"
    @State private var openId: String?
    @State private var status = ""
    @State private var feed: LoadState = .ready

    private let household = HouseholdFixtures.mokoena
    private var viewers: [HouseholdViewer] { HouseholdFixtures.viewers { vetting.subject($0) } }
    private var viewer: HouseholdViewer { viewers.first { $0.id == viewerId } ?? viewers[0] }
    private var seen: [(member: HouseholdMember, visibility: HouseholdVisibility)] {
        household.members.map { ($0, visibilityFor(viewer, $0)) }
    }
    /* A household member already knows who lives there, so the roster tells them nothing new and the
       refusals are worth showing by name. To anybody else the roster is itself information, so they
       are shown only the people they have a basis for, and no count of the rest. */
    private var roster: [(member: HouseholdMember, visibility: HouseholdVisibility)] {
        viewer.memberId != nil ? seen : seen.filter { $0.visibility.level != .none }
    }
    private var clinical: [HouseholdMember] { seen.filter { $0.visibility.level.atLeast(.clinical) }.map(\.member) }
    private var open: (member: HouseholdMember, visibility: HouseholdVisibility)? {
        openId.flatMap { id in seen.first { $0.member.id == id } }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                DemoBadge()
                CareHeading(eyebrow: "Patients · design preview", title: thuso(.householdRecord, store.locale),
                            subtitle: "One household, and what each member may see of the others. Fictional people, fictional scheme; nothing here is a record and nothing reaches a service.")
                viewerControl
                Text(spokenState).font(.caption).foregroundStyle(ThusoTheme.body)
                    .accessibilityAddTraits(.updatesFrequently)
                householdCard
                StatePicker(title: "Preview how this household behaves when the record service is unavailable", state: $feed)
                StateBlock(state: feed, subject: "This household record", permission: "record access", retry: { feed = .ready }) {
                    VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                        rosterSection
                        withheldNotice
                        if let open, open.visibility.level.atLeast(.emergency) { openedMember(open) }
                        SectionHeading(title: "Shared appointments")
                        appointments
                        SectionHeading(title: "Medical aid and dependants")
                        scheme
                        SectionHeading(title: "Immunisations due")
                        immunisations
                        SectionHeading(title: "Chronic medicine to collect")
                        collections
                        SectionHeading(title: "Book a home visit")
                        homeVisits
                    }
                }
            }
            .padding(ThusoSpacing.space16)
        }
        .thusoGround()
        .navigationTitle(thuso(.householdRecord, store.locale)).navigationBarTitleDisplayMode(.inline)
    }

    private var spokenState: String {
        if status.isEmpty {
            return "Viewing as \(viewer.name) — \(viewer.role). Switch above to see the same household through someone else’s permissions."
        }
        return status
    }
    private func choose(_ id: String) {
        guard let next = viewers.first(where: { $0.id == id }) else { return }
        let count = household.members.filter { visibilityFor(next, $0).level.atLeast(.emergency) }.count
        viewerId = id
        openId = nil
        if next.memberId != nil {
            status = "Viewing as \(next.name). \(count) of \(household.members.count) records are open to them; the rest are refused with the reason on the card."
        } else if count == 0 {
            status = "Viewing as \(next.name), who does not live here. No member of this household is listed for them at all."
        } else {
            status = "Viewing as \(next.name), who does not live here. Only the \(count) member\(count == 1 ? "" : "s") they have a basis for are listed; the household roster is itself information."
        }
    }

    @ViewBuilder private var viewerControl: some View {
        CareCard {
            StatusPill(text: "Design review", tone: "quiet")
            Text("The same household, through different eyes").font(.headline).foregroundStyle(ThusoTheme.ink)
            Text("Every line below is asked for twice — of the vetting module, and of the person the record belongs to. Change the viewer and watch the household change shape; that is the only way to tell whether a refusal was designed or assumed.")
                .font(.footnote).foregroundStyle(ThusoTheme.body)
            /* The label is drawn rather than left to the picker: a menu picker in a card shows only
               its value, and “Viewing as” is the whole point of the control. */
            Text(thuso(.viewingAs, store.locale)).font(.caption).foregroundStyle(ThusoTheme.body)
            Picker(thuso(.viewingAs, store.locale), selection: Binding(get: { viewerId }, set: { choose($0) })) {
                ForEach(viewers) { Text("\($0.name) · \($0.role)").tag($0.id) }
            }
            .labelsHidden()
            if let subject = viewer.subject {
                HStack(spacing: ThusoSpacing.space8) {
                    SubjectStatusPill(status: summarise(subject).status)
                    Text("\(subject.name) · \(subject.role?.name ?? subject.roleId) · \(subject.reference)")
                        .font(.caption2).foregroundStyle(ThusoTheme.body)
                }
                .accessibilityElement(children: .combine)
            }
        }
    }

    @ViewBuilder private var householdCard: some View {
        CareCard {
            FieldRow(label: "Household", value: household.name)
            FieldRow(label: "Held as", value: "FHIR Group · \(household.id)")
            FieldRow(label: "Care area", value: household.area)
            Text(Records.type("household")?.summary ?? "").font(.footnote).foregroundStyle(ThusoTheme.body)
        }
    }

    @ViewBuilder private var rosterSection: some View {
        if roster.isEmpty {
            CareCard {
                Text("Nothing here is yours to see.").font(.headline).foregroundStyle(ThusoTheme.ink)
                Text(viewer.subject.map { can($0, "view-patient-summary").reason ?? "" } ?? "Nobody outside this household is shown its members.")
                    .font(.footnote).foregroundStyle(ThusoTheme.body)
                Text("Not one member is named, and no count of them is given. A refusal that still told you how many people live here, and which of them have records, would be a refusal in name only.")
                    .font(.caption2).foregroundStyle(ThusoTheme.body)
            }
            .accessibilityElement(children: .combine)
        } else {
            ForEach(roster, id: \.member.id) { entry in memberCard(entry.member, entry.visibility) }
        }
    }

    @ViewBuilder private func memberCard(_ member: HouseholdMember, _ visibility: HouseholdVisibility) -> some View {
        let permitted = visibility.level.atLeast(.emergency)
        CareCard {
            VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                HStack(spacing: ThusoSpacing.space12) {
                    Text(member.initials).font(.subheadline.weight(.bold)).foregroundStyle(ThusoTheme.indigoDeep)
                        .frame(width: 44, height: 44)
                        .background(member.relation == "Child" ? ThusoTheme.mangoSoft : ThusoTheme.indigoSoft, in: Circle())
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(member.name).font(.callout.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                        Text("\(member.relation) · \(householdAge(member)) years · \(member.reference)")
                            .font(.caption).foregroundStyle(ThusoTheme.body)
                    }
                    Spacer(minLength: 6)
                    StatusPill(text: visibility.level.label, tone: visibility.level.tone)
                }
                Text(visibility.reason).font(.footnote).foregroundStyle(ThusoTheme.body)
                    .fixedSize(horizontal: false, vertical: true)
            }
            /* One spoken sentence per card: who they are, what is open, and why. A reader who has to
               assemble a refusal out of four fragments will not assemble it. */
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(member.name), \(member.relation), \(householdAge(member)) years. \(visibility.level.label). \(visibility.reason)")
            Button {
                openId = member.id
                status = "Opened \(member.name) at \(visibility.level.label.lowercased())."
            } label: {
                Label(permitted ? "Open what you may see" : "Refused",
                      systemImage: permitted ? "checkmark.shield" : "lock")
            }
            .buttonStyle(QuietButton())
            .disabled(!permitted)
            .accessibilityLabel(permitted ? "Open what you may see of \(member.name)" : "\(member.name)’s record is refused to you")
        }
    }

    /* The rule this whole surface exists to get right, written once and standing on every household
       whether or not there is anything behind it. A notice that appeared only where there was
       something to hide would be the disclosure it is meant to prevent, and a count of the records
       it stood on would be another one. */
    @ViewBuilder private var withheldNotice: some View {
        HStack(alignment: .top, spacing: ThusoSpacing.space12) {
            Image(systemName: "lock").font(.body).foregroundStyle(ThusoTheme.mangoInk)
            Text("Every record here has parts only the person themselves can release. This line stands on all of them, whether or not there is anything behind it — a notice that appeared only where there was something to hide would be the disclosure it is meant to prevent, and a count of the records it stood on would be another one.")
                .font(.footnote).foregroundStyle(ThusoTheme.body)
        }
        .padding(ThusoSpacing.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ThusoTheme.mangoSoft, in: RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("A category is withheld from every record in this household. Every record here has parts only the person themselves can release. This notice stands on all of them, whether or not there is anything behind it.")
    }

    @ViewBuilder private func openedMember(_ entry: (member: HouseholdMember, visibility: HouseholdVisibility)) -> some View {
        CareCard {
            Text(entry.member.name).font(.headline).foregroundStyle(ThusoTheme.ink)
            Text("\(entry.visibility.level.label) · \(entry.visibility.reason)").font(.caption).foregroundStyle(ThusoTheme.body)
            if entry.visibility.level == .emergency {
                /* The contract’s emergency card is five fields — blood group, allergies, critical
                   conditions, current medicine and one contact. Three of them are here. Current
                   medicine and conditions are exactly what would disclose contraception or
                   antiretroviral therapy, so a guardian’s reach over a child old enough to consent
                   for themselves stops short of them. */
                FieldRow(label: "Blood group", value: entry.member.bloodGroup)
                FieldRow(label: "Allergies", value: entry.member.allergies.joined(separator: "; "))
                FieldRow(label: "Emergency contact", value: entry.member.emergencyContact)
                Text("Three lines, and deliberately not the fourth. Conditions and medicines would say more about \(entry.member.firstName) than an emergency needs to know.")
                    .font(.caption2).foregroundStyle(ThusoTheme.body)
            } else {
                SummaryCardView(member: entry.member, fields: Records.summaryCard.fields)
            }
            if entry.visibility.level == .own {
                NavigationLink { HealthSummaryView(memberId: entry.member.id) } label: {
                    Label("Share this summary with someone", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(QuietButton())
            }
        }
    }

    @ViewBuilder private var appointments: some View {
        CareCard {
            ForEach(HouseholdFixtures.appointments) { appointment in
                if let member = household.member(appointment.memberId) {
                    let visibility = visibilityFor(viewer, member)
                    /* A member of the household sees the whole calendar, because they already know
                       who is out of the house on Saturday morning. Everybody else sees only the
                       people they have a basis for. */
                    if viewer.memberId != nil || visibility.level.atLeast(.emergency) {
                        HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                            TileIcon(symbol: "calendar.badge.clock", size: 38)
                            VStack(alignment: .leading, spacing: 3) {
                                Text("\(vettingDate(appointment.when)) · \(appointment.time) · \(member.firstName)")
                                    .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                                Text(visibility.level.atLeast(.summary) ? appointment.service
                                     : "A booked visit. What it is for is not part of the household calendar.")
                                    .font(.caption).foregroundStyle(ThusoTheme.body)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, 4)
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            Text("A household calendar says who is out of the house on Saturday morning. It says what the visit is for only to someone already allowed to know.")
                .font(.caption2).foregroundStyle(ThusoTheme.body)
        }
    }

    @ViewBuilder private var scheme: some View {
        let principal = viewer.memberId == household.scheme.principal
        let billing: VettingDecision = viewer.memberId != nil
            ? VettingDecision(allowed: true, reason: nil, blockedBy: [])
            : (viewer.subject.map { can($0, "view-billing") }
               ?? VettingDecision(allowed: false, reason: "Nothing stands behind this claim, so the scheme record is not opened.", blockedBy: []))
        CareCard {
            if billing.allowed {
                FieldRow(label: "Scheme", value: household.scheme.name)
                FieldRow(label: "Plan", value: household.scheme.plan)
                FieldRow(label: "Membership", value: household.scheme.membership)
                ForEach(household.members.filter { principal || $0.id == viewer.memberId }) { member in
                    FieldRow(label: member.name + (member.id == household.scheme.principal ? " · principal" : ""),
                             value: "Dependant \(member.dependant)")
                }
                Text("\(principal ? "You are the principal member, so you hold every dependant code." : "Only your own dependant code is shown. The others are not yours to quote.") A dependant code links a person to a scheme; it is not a key to their record, and nothing clinical is stored against it.")
                    .font(.caption2).foregroundStyle(ThusoTheme.body)
            } else {
                RefusalCard(title: "The scheme record is not open to this viewer", decision: billing)
                Text("Claims carry a service code and never the diagnosis in words, which is what makes a refusal here cheap rather than obstructive.")
                    .font(.caption2).foregroundStyle(ThusoTheme.body)
            }
        }
    }

    @ViewBuilder private var immunisations: some View {
        CareCard {
            ForEach(clinical) { member in
                ForEach(member.immunisations, id: \.vaccine) { due in
                    dueRow(symbol: "syringe", title: "\(member.firstName) · \(due.vaccine)", detail: "Due \(vettingDate(due.due))")
                }
            }
            /* The footer never says whether there is anything outstanding for the members the viewer
               cannot see. “A vaccine is due for someone you cannot see” is itself a clinical fact. */
            Text("This list covers the members whose records are open to you. It does not say whether there is anything outstanding for the others. Dates are indicative; the national EPI schedule governs.")
                .font(.caption2).foregroundStyle(ThusoTheme.body)
        }
    }

    @ViewBuilder private var collections: some View {
        CareCard {
            ForEach(clinical) { member in
                ForEach(member.collections, id: \.medicine) { collection in
                    dueRow(symbol: "pills", title: "\(member.firstName) · \(collection.medicine)",
                           detail: "Ready \(vettingDate(collection.ready)) · \(collection.pharmacy)")
                }
            }
            Text("Same rule, and for the same reason: “a collection is due for someone you cannot see” is itself a clinical fact about that person.")
                .font(.caption2).foregroundStyle(ThusoTheme.body)
        }
    }

    @ViewBuilder private func dueRow(symbol: String, title: String, detail: String) -> some View {
        HStack(alignment: .top, spacing: ThusoSpacing.space12) {
            TileIcon(symbol: symbol, size: 38)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                Text(detail).font(.caption).foregroundStyle(ThusoTheme.body)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var homeVisits: some View {
        CareCard {
            Text("Arranging care is not reading a record, so this stays open to the household while the record above stays shut.")
                .font(.footnote).foregroundStyle(ThusoTheme.body)
            ForEach(household.members) { member in
                Button {
                    status = "Home visit requested for \(member.name). Nothing is booked in this preview, and booking it would still tell you nothing about what the nurse finds."
                } label: {
                    Label("A visit for \(member.firstName)", systemImage: "house")
                }
                .buttonStyle(QuietButton())
                .disabled(viewer.memberId == nil)
            }
            Text(viewer.memberId != nil
                 ? "You can arrange a visit for anyone in the household. The visit summary goes to them."
                 : "Only a member of the household can arrange visits for it.")
                .font(.caption2).foregroundStyle(ThusoTheme.body)
        }
    }
}

// MARK: - The summary card

/* Nine fields, in the contract’s own order, walked from the contract rather than typed out here —
   so the card cannot grow a field records.json does not have. The withheld notice below it is
   constant, and names the categories the contract names. */
struct SummaryCardView: View {
    let member: HouseholdMember
    let fields: [String]
    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            ForEach(summaryValues(member, fields: fields)) { field in
                FieldRow(label: field.label, value: field.value)
            }
        }
        HStack(alignment: .top, spacing: ThusoSpacing.space12) {
            Image(systemName: "lock").font(.body).foregroundStyle(ThusoTheme.mangoInk)
            VStack(alignment: .leading, spacing: 5) {
                Text("Withheld from every summary.").font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                Text(Records.summaryCard.withheld).font(.footnote).foregroundStyle(ThusoTheme.body)
                Text(householdProtectedCategories.joined(separator: " · ")).font(.caption2).foregroundStyle(ThusoTheme.body)
            }
        }
        .padding(ThusoSpacing.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ThusoTheme.mangoSoft, in: RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Withheld from every summary. \(Records.summaryCard.withheld) The categories are \(householdProtectedCategories.joined(separator: ", ")). This notice reads the same on every summary this app produces.")
    }
}
