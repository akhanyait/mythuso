import SwiftUI

/* First run, and the screen somebody uses when they have lost the phone it ran on.
 *
 * Both were system `Form`s, which on a six-step wizard has a specific cost: a `Form` gives the
 * grouped-row treatment to the step somebody is on, the standing disclosure, and the button they
 * are aiming for, all at the same weight — so on the step that asks for a phone number the sentence
 * saying no account is created was one grey row among four. The step is a lead panel now, the
 * disclosure is quiet, and the button is the only full-width charcoal thing on the screen.
 *
 * The recovery routes were the other defect worth naming. Three ways back into an account, each
 * with a wait attached, were three rows behind a twenty-point radio button — and the difference
 * between "about 2 minutes" and "same day, during opening hours" is the whole of the decision
 * somebody locked out of their own health record is making. They are ChoiceCards, the wait is the
 * footnote line, and the card is the target. */

struct OnboardingView: View {
    @EnvironmentObject private var store: PreviewStore
    @Environment(\.dismiss) private var dismiss
    @State private var step = 0
    @State private var phone = ""
    @State private var code = ""
    @State private var codeError = ""
    @State private var idNumber = ""
    @State private var trusted = "Nomsa Molefe · Mother"
    @State private var recoveryWord = ""
    @State private var consentCare = false
    @State private var consentPopia = false
    @State private var consentUpdates = false
    private let steps = ["Welcome", "Your number", "Verify", "Identity", "Recovery", "Consent"]
    private var phoneOk: Bool { phone.filter(\.isNumber).count == 10 && phone.hasPrefix("0") }
    private var idCheck: (ok: Bool, message: String) { validateSaId(idNumber) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: ThusoSpacing.space24) {
                    /* The sentence saying no account is created was at the foot of a six-step form,
                       so on the step that asks for a phone number it was below the fold. It is
                       still at the foot; the standing disclosure is also at the top, read first. */
                    DemoBadge()
                    SurfaceHeading(eyebrow: "Set up MyThuso", title: steps[step])
                    SurfacePanel(tone: .quiet, padding: ThusoSpacing.space16) {
                        StepDots(step: step + 1, total: steps.count, label: steps[step])
                    }
                    switch step {
                    case 0: welcome
                    case 1: number
                    case 2: verify
                    case 3: identity
                    case 4: recovery
                    default: consent
                    }
                    Text("Nothing you type here leaves your device. This preview creates no account.")
                        .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.vertical, ThusoSpacing.space16)
            }
            .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
            .thusoGround()
            .navigationTitle("Set up MyThuso")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Skip") { dismiss() } } }
        }
    }

    @ViewBuilder private var welcome: some View {
        SurfacePanel(tone: .lead) {
            PanelHead("Choose your language")
            PickRow(label: "Language", selection: $store.locale,
                    options: ThusoLocale.allCases.map { ($0, "\($0.native) · \($0.reviewLabel)") })
            if let notice = store.locale.reviewNotice {
                Label(notice, systemImage: "exclamationmark.triangle")
                    .font(.thuso(.footnote)).foregroundStyle(ThusoRole.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(ThusoLanguageNotes.clinicalRule).font(.thuso(.footnote))
                .foregroundStyle(ThusoRole.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
        }
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Button("Create my account") { step = 1 }.buttonStyle(CareButton())
            NavigationLink { RecoverAccessView() } label: {
                NavPillLabel(title: "I’ve lost access to my account", symbol: "key")
            }.buttonStyle(.plain)
        }
    }

    @ViewBuilder private var number: some View {
        SurfacePanel(tone: .lead) {
            PanelHead("What’s your number?")
            WriteField(label: "Mobile number", text: $phone, hint: "082 000 0000",
                       note: phone.isEmpty || phoneOk ? "We’ll send a one-time code. Standard network rates apply."
                                                      : "Enter a 10-digit South African mobile number, starting with 0.",
                       wrong: !phone.isEmpty && !phoneOk,
                       keyboard: .numberPad, contentType: .telephoneNumber)
        }
        stepButtons(forward: "Send my code", enabled: phoneOk, action: { code = ""; codeError = ""; step = 2 },
                    backTitle: "Back", back: 0)
    }

    @ViewBuilder private var verify: some View {
        SurfacePanel(tone: .lead) {
            PanelHead("Check your messages", note: "In this preview the code is 240924.")
            CodeBoxes(code: $code, invalid: !codeError.isEmpty, label: "Verification code")
            if !codeError.isEmpty {
                Text(codeError).font(.thuso(.footnote)).foregroundStyle(ThusoRole.dangerInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        stepButtons(forward: "Verify", enabled: code.count >= 6,
                    action: { code == "240924" ? step = 3 : (codeError = "That code doesn’t match. Check the message and try again.") },
                    backTitle: "Use a different number", back: 1)
    }

    @ViewBuilder private var identity: some View {
        SurfacePanel(tone: .lead) {
            PanelHead("Let’s confirm it’s you")
            WriteField(label: "SA ID number", text: $idNumber, hint: "13 digits",
                       note: idNumber.isEmpty ? "Use a fictional number for this preview — for example 8001015009087." : idCheck.message,
                       wrong: !idNumber.isEmpty && !idCheck.ok, keyboard: .numberPad)
            Text("Production verification runs against the Department of Home Affairs through an accredited provider, with a documented lawful basis. Nothing is verified here.")
                .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
        }
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Button("Continue") { step = 4 }.buttonStyle(CareButton()).disabled(!idCheck.ok)
            /* Not a lesser route. Roughly one adult in ten in this country cannot produce an ID
               number on demand, and a sign-up that stops there is a sign-up that has excluded them. */
            Button("I don’t have an SA ID number") { step = 4 }.buttonStyle(QuietButton())
            Button("Back") { step = 2 }.buttonStyle(QuietButton())
        }
    }

    @ViewBuilder private var recovery: some View {
        SurfacePanel(tone: .lead) {
            PanelHead("If you ever lose your phone")
            PickRow(label: "Trusted contact", selection: $trusted,
                    options: ["Nomsa Molefe · Mother", "Thabo Molefe · Son", "I’ll add someone later"].map { ($0, $0) })
            WriteField(label: "Recovery word", text: $recoveryWord, hint: "Something only you would choose",
                       note: "Choose something memorable that isn’t your name, birthday or a family name. A trusted contact can start recovery for you — they never see your records, and you are told every time recovery is attempted.")
        }
        stepButtons(forward: "Continue", enabled: recoveryWord.trimmingCharacters(in: .whitespaces).count >= 3,
                    action: { step = 5 }, backTitle: "Back", back: 3)
    }

    @ViewBuilder private var consent: some View {
        SurfacePanel(tone: .lead) {
            PanelHead("Your choices, before we start")
            AgreeRow(text: "I agree to MyThuso arranging home visits and holding the health information from them. (Required)", on: $consentCare)
            Hairline()
            AgreeRow(text: "I have read how my information is used, stored and deleted under POPIA. (Required)", on: $consentPopia)
            Hairline()
            AgreeRow(text: "Send me optional health tips and product news.", on: $consentUpdates)
            Text("Consent is recorded with its version, wording and timestamp so you can see exactly what you agreed to, and withdraw it later.")
                .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
        }
        stepButtons(forward: "Enter MyThuso", enabled: consentCare && consentPopia,
                    action: { dismiss() }, backTitle: "Back", back: 4)
    }

    @ViewBuilder private func stepButtons(forward: String, enabled: Bool, action: @escaping () -> Void,
                                          backTitle: String, back: Int) -> some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Button(forward, action: action).buttonStyle(CareButton()).disabled(!enabled)
            Button(backTitle) { step = back }.buttonStyle(QuietButton())
        }
    }
}

struct RecoverAccessView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var route = ""
    @State private var submitted = false
    private let routes = [
        ("Code to my registered number", "Fastest, if you still have the SIM. A new code is sent to the number on the account.", "About 2 minutes"),
        ("Ask my trusted contact", "Nomsa Molefe confirms it’s you. She never sees your health records, and you both get told.", "Up to 24 hours"),
        ("In person at a Thuso Corner", "Bring your ID to a community site. Used when a number and a trusted contact are both gone.", "Same day, during opening hours")
    ]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space24) {
                if submitted { started } else { choose }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle("Account recovery").navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder private var started: some View {
        SurfaceHeading(eyebrow: "Account recovery", title: "We’ve started your recovery")
        SurfacePanel(tone: .lead) {
            FactRow(label: "Reference", value: "REC-0042 · Demo")
            FactRow(label: "Indicative wait", value: routes.first { $0.0 == route }?.2 ?? "")
            Text("Nothing was submitted. Production recovery is rate-limited, audited and reversible for a cooling-off period.")
                .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
        }
        Button("Done") { dismiss() }.buttonStyle(CareButton())
    }

    @ViewBuilder private var choose: some View {
        SurfaceHeading(eyebrow: "Account recovery", title: "How can we reach you?")
        /* The wait is the footnote on each card rather than the smallest line in a grouped row.
           Somebody locked out of their own health record is choosing between two minutes and a
           trip across town, and that is the whole of the decision. */
        ForEach(routes, id: \.0) { option in
            ChoiceCard(title: option.0, detail: option.1, footnote: option.2,
                       chosen: route == option.0) { route = option.0 }
        }
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Button("Start recovery") { submitted = true }.buttonStyle(CareButton()).disabled(route.isEmpty)
            Text("Recovery never reveals your records to the person helping you.")
                .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
