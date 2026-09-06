import SwiftUI

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
            Form {
                Section { StepDots(step: step + 1, total: steps.count, label: steps[step]) }
                switch step {
                case 0: welcome
                case 1: number
                case 2: verify
                case 3: identity
                case 4: recovery
                default: consent
                }
                Section { Text("Nothing you type here leaves your device. This preview creates no account.").font(.caption).foregroundStyle(.secondary) }
            }
            .navigationTitle("Set up MyThuso")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Skip") { dismiss() } } }
        }
    }
    @ViewBuilder private var welcome: some View {
        Section("Choose your language") {
            Picker("Language", selection: $store.locale) { ForEach(ThusoLocale.allCases) { Text($0.native).tag($0) } }.pickerStyle(.inline).labelsHidden()
            Text("Navigation and the main actions are translated. Clinical wording stays in English until a clinical language review is complete.").font(.caption).foregroundStyle(.secondary)
        }
        Section {
            Button("Create my account") { step = 1 }
            NavigationLink("I’ve lost access to my account") { RecoverAccessView() }
        }
    }
    @ViewBuilder private var number: some View {
        Section("What’s your number?") {
            TextField("082 000 0000", text: $phone).keyboardType(.numberPad).textContentType(.telephoneNumber)
            Text(phone.isEmpty || phoneOk ? "We’ll send a one-time code. Standard network rates apply." : "Enter a 10-digit South African mobile number, starting with 0.")
                .font(.caption).foregroundStyle(phone.isEmpty || phoneOk ? Color.secondary : Color.red)
        }
        Section {
            Button("Send my code") { code = ""; codeError = ""; step = 2 }.disabled(!phoneOk)
            Button("Back") { step = 0 }
        }
    }
    @ViewBuilder private var verify: some View {
        Section("Check your messages") {
            Text("In this preview the code is 240924.").font(.caption).foregroundStyle(.secondary)
            CodeBoxes(code: $code, invalid: !codeError.isEmpty, label: "Verification code").listRowInsets(EdgeInsets(top: 10, leading: 14, bottom: 10, trailing: 14))
            if !codeError.isEmpty { Text(codeError).font(.caption).foregroundStyle(.red) }
        }
        Section {
            Button("Verify") { code == "240924" ? step = 3 : (codeError = "That code doesn’t match. Check the message and try again.") }.disabled(code.count < 6)
            Button("Use a different number") { step = 1 }
        }
    }
    @ViewBuilder private var identity: some View {
        Section("Let’s confirm it’s you") {
            TextField("13-digit SA ID number", text: $idNumber).keyboardType(.numberPad)
            Text(idNumber.isEmpty ? "Use a fictional number for this preview — for example 8001015009087." : idCheck.message)
                .font(.caption).foregroundStyle(idNumber.isEmpty || idCheck.ok ? Color.secondary : Color.red)
            Text("Production verification runs against the Department of Home Affairs through an accredited provider, with a documented lawful basis. Nothing is verified here.").font(.caption).foregroundStyle(.secondary)
        }
        Section {
            Button("Continue") { step = 4 }.disabled(!idCheck.ok)
            Button("I don’t have an SA ID number") { step = 4 }
            Button("Back") { step = 2 }
        }
    }
    @ViewBuilder private var recovery: some View {
        Section("If you ever lose your phone") {
            Picker("Trusted contact", selection: $trusted) {
                Text("Nomsa Molefe · Mother").tag("Nomsa Molefe · Mother")
                Text("Thabo Molefe · Son").tag("Thabo Molefe · Son")
                Text("I’ll add someone later").tag("I’ll add someone later")
            }
            TextField("Recovery word", text: $recoveryWord)
            Text("Choose something memorable that isn’t your name, birthday or a family name. A trusted contact can start recovery for you — they never see your records, and you are told every time recovery is attempted.").font(.caption).foregroundStyle(.secondary)
        }
        Section {
            Button("Continue") { step = 5 }.disabled(recoveryWord.trimmingCharacters(in: .whitespaces).count < 3)
            Button("Back") { step = 3 }
        }
    }
    @ViewBuilder private var consent: some View {
        Section("Your choices, before we start") {
            Toggle("I agree to MyThuso arranging home visits and holding the health information from them. (Required)", isOn: $consentCare)
            Toggle("I have read how my information is used, stored and deleted under POPIA. (Required)", isOn: $consentPopia)
            Toggle("Send me optional health tips and product news.", isOn: $consentUpdates)
            Text("Consent is recorded with its version, wording and timestamp so you can see exactly what you agreed to, and withdraw it later.").font(.caption).foregroundStyle(.secondary)
        }
        Section {
            Button("Enter MyThuso") { dismiss() }.disabled(!consentCare || !consentPopia)
            Button("Back") { step = 4 }
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
        Form {
            if submitted {
                Section {
                    Label("We’ve started your recovery", systemImage: "checkmark.seal.fill").foregroundStyle(ThusoTheme.teal)
                    LabeledContent("Reference", value: "REC-0042 · Demo")
                    LabeledContent("Indicative wait", value: routes.first { $0.0 == route }?.2 ?? "")
                    Text("Nothing was submitted. Production recovery is rate-limited, audited and reversible for a cooling-off period.").font(.caption).foregroundStyle(.secondary)
                }
                Section { Button("Done") { dismiss() } }
            } else {
                Section("How can we reach you?") {
                    ForEach(routes, id: \.0) { option in
                        Button { route = option.0 } label: {
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: route == option.0 ? "largecircle.fill.circle" : "circle").foregroundStyle(ThusoTheme.teal)
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(option.0).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                                    Text(option.1).font(.caption).foregroundStyle(.secondary)
                                    Text(option.2).font(.caption2).foregroundStyle(ThusoTheme.teal)
                                }
                            }
                        }
                        .accessibilityAddTraits(route == option.0 ? [.isSelected] : [])
                    }
                }
                Section {
                    Button("Start recovery") { submitted = true }.disabled(route.isEmpty)
                    Text("Recovery never reveals your records to the person helping you.").font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Account recovery").navigationBarTitleDisplayMode(.inline)
    }
}
