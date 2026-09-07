import SwiftUI

/* The teleconsultation call.

   The doctor's review queue and the consultation record already existed; the encounter between them
   did not. This is the whole of it — before, during and after — and the parts that took the design
   work are not the ones that look like a video call.

   Who is in the room. A MyThuso consultation frequently has a nurse standing in the patient's
   kitchen, and sometimes a guardian or an interpreter as well. That is not a private doctor's
   appointment. Everyone who can hear the patient is named before the call opens, with where they
   are standing and what they can hear, and each of them is a separate question put to the patient
   rather than a setting configured for them. Any of them except the doctor can be asked to step out
   in the middle of the call, and the cost of asking is said before the question, not after it: the
   moment the nurse leaves, everything that needed hands is withdrawn from what the doctor may do.

   Recording. Not offered here, and not offered as a switch either. This build has no microphone
   permission, no camera permission and nowhere to put a recording, so a control for it would be a
   control that cannot do what it says — and a patient taught to tick it in a preview has been
   taught to tick it. What the screen shows instead is what a recording would be for, who could open
   one, how long it would live and how it would be asked for.

   A dropped line. The state this screen exists for, and the one most products handle worst. The
   encounter stays open, the doctor calls back rather than the patient redialling, both ends count
   down the same ninety seconds, and a nurse in the room stays with the patient. If the line does not
   come back the encounter is closed as interrupted — with no assessment, no plan and no signature —
   because a record that cannot tell a finished consultation from an abandoned one is worse than no
   record, since it will be believed.

   Bandwidth. Sound only is a designed path. Most of South Africa, most of the time, is not on a
   connection that carries video, and a product that treats sound as a failure state is a product
   that works in Sandton.

   Nothing connects. No media framework is imported, no camera or microphone is requested and this
   target declares neither permission. Every party is fictional. */

private let callDoctors = ["D-401", "D-402"]
private let callStages = ["Who is in the room", "Identity", "Recording", "The call", "Afterwards"]

struct TeleconsultView: View {
    var reference = "TH-2048"
    var patient = "Lerato Molefe"
    @ObservedObject private var vetting = VettingStore.shared
    @State private var stage = 0
    @State private var doctorId = callDoctors[0]
    @State private var present: [String: Bool] = ["nurse": true, "guardian": false, "interpreter": false]
    @State private var consented: [String: Bool] = ["doctor": false, "nurse": false, "guardian": false, "interpreter": false]
    @State private var withdrawnNote: String?
    @State private var code = ""
    @State private var codeError = ""
    @State private var identityConfirmed = false
    @State private var mediaState = Teleconsult.media.state
    @State private var connectionId = "video"
    @State private var everDropped = false
    @State private var resumed = false
    @State private var holdLeft = Teleconsult.reconnect.holdSeconds
    @State private var decisionReached = false
    @State private var refusedClinician = false
    @State private var openRecord = false
    private let clock = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    private var doctor: VettingSubject? { vetting.subject(doctorId) }
    private var consult: VettingDecision? { doctor.map { can($0, "sign-clinical-review") } }
    private var nursePresent: Bool { present["nurse"] == true && consented["nurse"] == true }
    private var dropped: Bool { connectionId == "dropped" }
    private var attempt: CallAttempt {
        CallAttempt(clinicianAllowed: !refusedClinician && (consult?.allowed ?? false),
                    identityConfirmed: identityConfirmed, consented: consented["doctor"] == true,
                    everConnected: identityConfirmed && consented["doctor"] == true,
                    lineDropped: everDropped, resumed: resumed, decisionReached: decisionReached)
    }
    private var outcome: EncounterOutcome { Teleconsult.outcome(of: attempt) }
    private func subject(for participant: CallParticipant) -> VettingSubject? {
        participant.id == "doctor" ? doctor
            : participant.id == "nurse" ? vetting.subject("N-205")
            : participant.id == "guardian" ? vetting.subject("G-032") : nil
    }
    private func displayName(_ participant: CallParticipant) -> String {
        participant.id == "patient" ? patient : (subject(for: participant)?.name ?? participant.name)
    }
    private var inTheRoom: [CallParticipant] {
        Teleconsult.participants.filter { $0.essential || present[$0.id] == true }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                DemoBadge()
                if stage < 4 {
                    Text("Step \(stage + 1) of \(callStages.count) · \(callStages[stage])")
                        .font(.caption).foregroundStyle(ThusoTheme.indigo)
                }
                CareHeading(eyebrow: "Doctor workspace", title: "Teleconsultation",
                            subtitle: "\(reference) · \(patient)")
                switch stage {
                case 0: roomStage
                case 1: identityStage
                case 2: recordingStage
                case 3: callStage
                default: afterwardsStage
                }
            }
            .padding(18)
        }
        .background(ThusoTheme.canvas)
        .navigationTitle("Teleconsultation").navigationBarTitleDisplayMode(.inline)
        .onReceive(clock) { _ in if dropped && holdLeft > 0 { holdLeft -= 1 } }
        .navigationDestination(isPresented: $openRecord) { ConsultationRecordView(reference: reference, patient: patient, writerId: doctorId) }
    }

    // MARK: - Who is in the room

    @ViewBuilder private var roomStage: some View {
        Text("Who will be able to see and hear you.").font(.system(size: 18, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
        Text(Teleconsult.rule("presence-is-consented").sentence).font(.footnote).foregroundStyle(ThusoTheme.body)

        CareCard {
            Picker("Doctor for this appointment", selection: $doctorId) {
                ForEach(callDoctors, id: \.self) { id in Text(vetting.subject(id)?.name ?? id).tag(id) }
            }
            if let doctor { Text("\(doctor.name) · \(doctor.reference)").font(.footnote).foregroundStyle(ThusoTheme.faint) }
            /* The same capability the clinical queue asks about, refused in the same words. A doctor
               told one thing by the queue and another by the call trusts neither. */
            if let consult, !consult.allowed {
                Label(consult.reason ?? "", systemImage: "xmark.shield")
                    .font(.system(size: 12.5)).foregroundStyle(ThusoTheme.danger)
            }
        }

        CareCard {
            Text("Who else is at the address or on the call").font(.system(size: 13, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
            ForEach(Teleconsult.participants.filter { !$0.essential }) { person in
                Toggle(person.name, isOn: Binding(
                    get: { present[person.id] == true },
                    set: { present[person.id] = $0; consented[person.id] = false }
                )).font(.system(size: 13.5))
            }
        }

        roster(canAsk: false)

        Text("Asked one at a time").font(.system(size: 17, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
        Text("Each of these is a separate answer, and each can be taken back in the middle of the call.")
            .font(.footnote).foregroundStyle(ThusoTheme.body)
        ForEach(inTheRoom.filter { $0.consentQuestion != nil }) { person in
            CareCard {
                Toggle(isOn: Binding(get: { consented[person.id] == true }, set: { consented[person.id] = $0 })) {
                    Text("“\(person.consentQuestion ?? "")”").font(.system(size: 13.5)).foregroundStyle(ThusoTheme.ink)
                }
                if consented[person.id] != true {
                    Text("If you say no: \(person.ifDeclined ?? "")").font(.footnote).foregroundStyle(ThusoTheme.body)
                } else if let item = Teleconsult.consentFor(participant: person.id), !item.required {
                    Text("You can change your mind during the call. \(item.revokedMidCall)")
                        .font(.footnote).foregroundStyle(ThusoTheme.faint)
                }
            }
        }

        refusalCard(Teleconsult.refusal("silent-observers"))
        if consult?.allowed == true {
            Button("Check identity") { stage = 1 }.buttonStyle(CareButton()).disabled(consented["doctor"] != true)
        } else {
            Button("Rebook with a doctor whose registration is current") { refusedClinician = true; stage = 4 }
                .buttonStyle(CareButton())
        }
    }

    // MARK: - Identity, both ends

    @ViewBuilder private var identityStage: some View {
        Text("Both ends, checked.").font(.system(size: 18, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
        CareCard {
            StatusPill(text: "What the patient checks", tone: "quiet")
            if let doctor {
                row("The doctor on this call", doctor.name)
                row("Council registration", doctor.reference)
            }
            Text(Teleconsult.identity.patientSideDetail).font(.footnote).foregroundStyle(ThusoTheme.body)
        }
        CareCard {
            StatusPill(text: "What the doctor checks", tone: "quiet")
            /* The same six-digit visit code the nurse is asked for at the door. One identity check
               in MyThuso, not two — a second mechanism invented for video would be a second thing to
               get wrong, and the one the patient had learned would stop being the one that counts. */
            Text("\(Teleconsult.identity.doctorSideDetail) In this preview the code is 482190.")
                .font(.footnote).foregroundStyle(ThusoTheme.body)
            TextField("Visit code", text: $code).keyboardType(.numberPad).textFieldStyle(.roundedBorder)
                .onChange(of: code) { _, _ in codeError = "" }
            if !codeError.isEmpty {
                Text(codeError).font(.system(size: 12.5)).foregroundStyle(ThusoTheme.danger)
            }
        }
        Text(Teleconsult.identity.whyOneMechanism).font(.footnote).foregroundStyle(ThusoTheme.faint)
        if codeError.isEmpty {
            Button("Confirm and continue") {
                if code == "482190" { identityConfirmed = true; stage = 2 } else { codeError = Teleconsult.identity.failure }
            }.buttonStyle(CareButton()).disabled(code.count < 6)
        } else {
            Button("Close the encounter") { stage = 4 }.buttonStyle(CareButton())
        }
        Button("Back") { stage = 0 }.buttonStyle(QuietButton())
    }

    // MARK: - Recording, asked separately and answered no

    @ViewBuilder private var recordingStage: some View {
        Text("Recording is a second question, and the answer here is no.")
            .font(.system(size: 18, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
        Text(Teleconsult.rule("recording-is-separate").sentence).font(.footnote).foregroundStyle(ThusoTheme.body)
        CareCard {
            Label(Teleconsult.recording.decision, systemImage: "record.circle.fill")
                .font(.system(size: 14, weight: .semibold)).foregroundStyle(ThusoTheme.mangoInk)
            Text(Teleconsult.recording.why).font(.system(size: 12.5)).foregroundStyle(ThusoTheme.body)
        }
        Text("What happens instead").font(.system(size: 17, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
        ForEach(Teleconsult.recording.instead, id: \.self) { line in
            Label(line, systemImage: "list.clipboard").font(.system(size: 12.5)).foregroundStyle(ThusoTheme.body)
        }
        Text("What would be asked, if it existed").font(.system(size: 17, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
        CareCard {
            row("When", "Its own screen")
            Text(Teleconsult.recording.whenItExists.askedSeparately).font(.footnote).foregroundStyle(ThusoTheme.body)
            row("Cost of refusing", "None")
            Text(Teleconsult.recording.whenItExists.refusingIsCostless).font(.footnote).foregroundStyle(ThusoTheme.body)
            row("While it runs", "Unmistakable")
            Text(Teleconsult.recording.whenItExists.whileRecording).font(.footnote).foregroundStyle(ThusoTheme.body)
            row("Who could open it", "Three, and no more")
            ForEach(Teleconsult.recording.whenItExists.whoMayView, id: \.self) { who in
                Label(who, systemImage: "lock").font(.system(size: 12.5)).foregroundStyle(ThusoTheme.slate)
            }
            row("Kept for", "\(Teleconsult.recording.whenItExists.keptForDays) days")
            Text(Teleconsult.recording.whenItExists.afterwards).font(.footnote).foregroundStyle(ThusoTheme.body)
        }
        refusalCard(Teleconsult.refusal("covert-recording"))
        Button("Open the call") { stage = 3 }.buttonStyle(CareButton())
        Button("Back") { stage = 1 }.buttonStyle(QuietButton())
    }

    // MARK: - The call

    @ViewBuilder private var callStage: some View {
        /* "Never asked" is not the same fact as "refused", and a screen that shows one state for
           both is telling the patient their answer did not matter. Both are here, switchable, so a
           review sees two screens rather than one with a different word in it. */
        CareCard {
            Text(Teleconsult.mediaState(mediaState).name).font(.system(size: 14, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
            Text(Teleconsult.mediaState(mediaState).detail).font(.system(size: 12.5)).foregroundStyle(ThusoTheme.body)
            Text(Teleconsult.media.sentence).font(.footnote).foregroundStyle(ThusoTheme.faint)
            Picker("Media permission", selection: $mediaState) {
                ForEach(Teleconsult.media.states) { Text($0.name).tag($0.id) }
            }.pickerStyle(.segmented)
            Text(Teleconsult.media.whyTheDistinctionMatters).font(.footnote).foregroundStyle(ThusoTheme.faint)
        }

        Text("In the room").font(.system(size: 17, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
        roster(canAsk: true)
        if let withdrawnNote {
            Text(withdrawnNote).font(.system(size: 12.5)).foregroundStyle(ThusoTheme.body)
                .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                .background(ThusoTheme.canvas, in: RoundedRectangle(cornerRadius: 14))
        }

        Text("The line").font(.system(size: 17, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
        Picker("The line", selection: $connectionId) {
            ForEach(Teleconsult.connection) { Text($0.name).tag($0.id) }
        }
        .pickerStyle(.segmented)
        .onChange(of: connectionId) { _, now in
            if now == "dropped" { everDropped = true; holdLeft = Teleconsult.reconnect.holdSeconds }
            else if everDropped { resumed = true }
        }
        Text("A preview control. In production this is the network's answer, not a choice.")
            .font(.footnote).foregroundStyle(ThusoTheme.faint)
        /* Both ends, side by side. The failure this is written against is a patient staring at a
           frozen picture while the doctor's screen says something else entirely. */
        CareCard {
            StatusPill(text: "The patient sees", tone: "quiet")
            Text(Teleconsult.connectionState(connectionId).patientSees).font(.system(size: 12.5)).foregroundStyle(ThusoTheme.body)
            Divider()
            StatusPill(text: "The doctor sees", tone: "quiet")
            Text(Teleconsult.connectionState(connectionId).doctorSees).font(.system(size: 12.5)).foregroundStyle(ThusoTheme.body)
        }
        Text(Teleconsult.connectionState(connectionId).note).font(.footnote).foregroundStyle(ThusoTheme.faint)
        if connectionId == "audio" {
            Text(Teleconsult.rule("audio-is-not-lesser").sentence).font(.system(size: 12.5)).foregroundStyle(ThusoTheme.body)
        }

        if dropped {
            CareCard {
                HStack(alignment: .top, spacing: 13) {
                    VStack(spacing: 3) {
                        Image(systemName: "hourglass").font(.system(size: 20)).foregroundStyle(ThusoTheme.danger)
                        Text("\(holdLeft)s").font(.system(size: 24, weight: .bold)).monospacedDigit().foregroundStyle(ThusoTheme.danger)
                        Text("of \(Teleconsult.reconnect.holdSeconds) · up to \(Teleconsult.reconnect.attempts) attempts")
                            .font(.system(size: 10.5)).multilineTextAlignment(.center).foregroundStyle(ThusoTheme.body)
                    }
                    .frame(width: 96)
                    VStack(alignment: .leading, spacing: 8) {
                        Text(Teleconsult.reconnect.whoCallsWhom).font(.system(size: 12.5, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
                        Text(Teleconsult.reconnect.duringTheHold).font(.system(size: 12.5)).foregroundStyle(ThusoTheme.body)
                        if nursePresent {
                            Text(Teleconsult.reconnect.nurseInTheRoom).font(.system(size: 12.5)).foregroundStyle(ThusoTheme.body)
                        }
                        if holdLeft == 0 {
                            Text(Teleconsult.reconnect.afterTheHold).font(.system(size: 12.5)).foregroundStyle(ThusoTheme.body)
                            Text(Teleconsult.reconnect.ifUnreachable).font(.system(size: 12.5)).foregroundStyle(ThusoTheme.body)
                        }
                        Text(Teleconsult.reconnect.whyNotLonger).font(.footnote).foregroundStyle(ThusoTheme.faint)
                    }
                }
            }
            .background(ThusoTheme.dangerSoft, in: RoundedRectangle(cornerRadius: 18))
        }

        Text("What this doctor may conclude, right now").font(.system(size: 17, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
        ForEach(Teleconsult.permitted(connection: connectionId, nursePresent: nursePresent)) { limit in
            limitRow(limit, allowed: true)
        }
        ForEach(Teleconsult.withdrawn(connection: connectionId, nursePresent: nursePresent)) { limit in
            limitRow(limit, allowed: false)
        }
        Text(Teleconsult.rule("examination-is-attributed").sentence).font(.system(size: 12.5)).foregroundStyle(ThusoTheme.body)
        refusalCard(Teleconsult.refusal("diagnose-the-unseen"))

        /* Nothing here can close an encounter as finished while the line is down. That is the button
           this whole feature exists in order not to have. */
        Button("Reach a decision and end the consultation") { decisionReached = true; stage = 4 }
            .buttonStyle(CareButton())
            .disabled(!Teleconsult.mayConclude(connection: connectionId, nursePresent: nursePresent) || consented["doctor"] != true)
        if !Teleconsult.mayConclude(connection: connectionId, nursePresent: nursePresent) {
            Text("The line does not currently allow a decision to be reached, so there is no way to close this encounter as a completed consultation.")
                .font(.footnote).foregroundStyle(ThusoTheme.danger)
        }
        Button("End without a decision") { stage = 4 }.buttonStyle(QuietButton())
    }

    // MARK: - Afterwards

    @ViewBuilder private var afterwardsStage: some View {
        StatusPill(text: outcome.countsAsConsultation ? "Counts as a consultation" : "Not a consultation",
                   tone: outcome.countsAsConsultation ? "teal" : "amber")
        Text(outcome.name).font(.system(size: 20, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
        Text(outcome.record).font(.system(size: 13)).foregroundStyle(ThusoTheme.body)
        CareCard {
            row("Charged", outcome.charged ? "Yes — a consultation was held" : "No")
            if !outcome.charged {
                Text(Teleconsult.refusal("charge-for-a-failure").sentence).font(.footnote).foregroundStyle(ThusoTheme.body)
            }
        }
        Text("What goes into the consultation record").font(.system(size: 17, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
        Text("The same sections every MyThuso encounter writes into. A section this encounter did not reach is withheld here rather than left empty for somebody to fill in later.")
            .font(.footnote).foregroundStyle(ThusoTheme.body)
        CareCard {
            ForEach(Teleconsult.sections(for: outcome), id: \.section.id) { entry in
                HStack(alignment: .top) {
                    Text(entry.section.name).font(.system(size: 13)).foregroundStyle(entry.written ? ThusoTheme.ink : ThusoTheme.faint)
                    Spacer(minLength: 8)
                    Label(entry.written ? "Yes" : "Not reached", systemImage: entry.written ? "checkmark" : "lock")
                        .font(.system(size: 12)).foregroundStyle(entry.written ? ThusoTheme.indigo : ThusoTheme.faint)
                }
            }
        }
        if outcome.countsAsConsultation {
            Text(Teleconsult.rule("dropped-is-not-finished").sentence).font(.footnote).foregroundStyle(ThusoTheme.body)
            Button("Write it up in the consultation record") { openRecord = true }.buttonStyle(QuietButton())
        } else {
            refusalCard(Teleconsult.refusal("half-a-consultation"))
            Text("\(Teleconsult.rule("dropped-is-not-finished").sentence) There is no button on this screen that closes this encounter as a completed consultation, for anybody, in any state.")
                .font(.system(size: 12.5)).foregroundStyle(ThusoTheme.danger)
                .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                .background(ThusoTheme.dangerSoft, in: RoundedRectangle(cornerRadius: 14))
        }
        Text("What this screen will not do").font(.system(size: 17, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
        ForEach(Teleconsult.refusals.filter { !["half-a-consultation", "charge-for-a-failure"].contains($0.id) }) { item in
            refusalCard(item)
        }
        Text("\(Teleconsult.rule("no-media-in-this-build").sentence) Nothing was transmitted, no encounter was written and no clinician was notified.")
            .font(.footnote).foregroundStyle(ThusoTheme.faint)
        Button("Start again") {
            stage = 0; refusedClinician = false; decisionReached = false; resumed = false; everDropped = false
            connectionId = "video"; code = ""; codeError = ""; identityConfirmed = false; withdrawnNote = nil
            consented = ["doctor": false, "nurse": false, "guardian": false, "interpreter": false]
        }.buttonStyle(QuietButton())
    }

    // MARK: - Pieces

    /* Everyone who can hear the patient, with the vetting register's name against the contract's
       role. A roster carrying its own names would be a second copy of the vetting record, and the
       copy is the one the patient would be reading. */
    @ViewBuilder private func roster(canAsk: Bool) -> some View {
        ForEach(inTheRoom) { person in
            let out = !person.essential && consented[person.id] != true
            CareCard {
                HStack(alignment: .top, spacing: 12) {
                    TileIcon(symbol: out ? "figure.walk.departure" : "person.fill",
                             tint: out ? ThusoTheme.faint : ThusoTheme.indigo,
                             background: out ? ThusoTheme.canvas : ThusoTheme.indigoSoft, size: 38)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(displayName(person)).font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(out ? ThusoTheme.faint : ThusoTheme.ink)
                        Text(person.name).font(.system(size: 11, weight: .semibold)).foregroundStyle(ThusoTheme.indigo)
                        Text(person.place).font(.system(size: 11.5)).foregroundStyle(ThusoTheme.faint)
                        Text("Can see: \(person.sees)").font(.system(size: 11.5)).foregroundStyle(ThusoTheme.faint)
                        Text("Can hear: \(person.hears)").font(.system(size: 11.5)).foregroundStyle(ThusoTheme.faint)
                        if out { Text("Not in the room. \(person.ifDeclined ?? "")").font(.system(size: 12)).foregroundStyle(ThusoTheme.body) }
                    }
                }
                if canAsk && person.mayBeAskedToLeave && !out {
                    Button("Ask \(displayName(person)) to step out") {
                        consented[person.id] = false
                        withdrawnNote = Teleconsult.consentFor(participant: person.id)?.revokedMidCall
                    }.buttonStyle(QuietButton())
                } else if person.essential && person.id != "patient" {
                    StatusPill(text: "Cannot be asked to leave", tone: "quiet")
                }
            }
        }
    }

    private func limitRow(_ limit: ClinicalLimit, allowed: Bool) -> some View {
        HStack(alignment: .top, spacing: 11) {
            Image(systemName: allowed ? "checkmark.circle.fill" : "nosign")
                .font(.system(size: 15)).foregroundStyle(allowed ? ThusoTheme.indigo : ThusoTheme.danger)
            VStack(alignment: .leading, spacing: 3) {
                Text(limit.name).font(.system(size: 13, weight: .medium)).foregroundStyle(ThusoTheme.ink)
                Text(limit.needs == "nurse" && !nursePresent
                     ? "Nobody is in the room to examine on the doctor’s behalf."
                     : limit.detail)
                    .font(.system(size: 11.5)).foregroundStyle(ThusoTheme.body)
            }
        }
        .padding(13).frame(maxWidth: .infinity, alignment: .leading)
        .background(allowed ? ThusoTheme.indigoSoft : ThusoTheme.canvas, in: RoundedRectangle(cornerRadius: 14))
    }

    private func refusalCard(_ item: CallRefusal) -> some View {
        HStack(alignment: .top, spacing: 11) {
            Image(systemName: "nosign").font(.system(size: 16)).foregroundStyle(ThusoTheme.danger)
            Text(item.sentence).font(.system(size: 12.5)).foregroundStyle(ThusoTheme.slate)
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(ThusoTheme.canvas, in: RoundedRectangle(cornerRadius: 14))
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top) {
            Text(label).font(.system(size: 13)).foregroundStyle(ThusoTheme.body)
            Spacer(minLength: 8)
            Text(value).font(.system(size: 13, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
                .multilineTextAlignment(.trailing)
        }
    }
}
