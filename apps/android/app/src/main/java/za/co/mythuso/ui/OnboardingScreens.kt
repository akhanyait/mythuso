package za.co.mythuso.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import za.co.mythuso.model.*

@Composable fun OnboardingScreen(store: PreviewStore, done: () -> Unit) {
    var step by remember { mutableIntStateOf(0) }
    var recovering by remember { mutableStateOf(false) }
    var phone by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var codeError by remember { mutableStateOf("") }
    var idNumber by remember { mutableStateOf("") }
    var trusted by remember { mutableStateOf("Nomsa Molefe · Mother") }
    var recoveryWord by remember { mutableStateOf("") }
    var consentCare by remember { mutableStateOf(false) }
    var consentPopia by remember { mutableStateOf(false) }
    var consentUpdates by remember { mutableStateOf(false) }
    val steps = listOf("Welcome", "Your number", "Verify", "Identity", "Recovery", "Consent")
    val phoneOk = phone.filter { it.isDigit() }.length == 10 && phone.startsWith("0")
    val idCheck = validateSaId(idNumber)
    if (recovering) { RecoverAccessScreen(back = { recovering = false }, done = done); return }
    ScreenColumn {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            steps.forEachIndexed { index, _ ->
                Box(Modifier.weight(1f).height(4.dp).background(if (index <= step) Teal else Color(0x1A000000), RoundedCornerShape(3.dp)))
            }
        }
        Text("Step ${step + 1} of ${steps.size} · ${steps[step]}", style = MaterialTheme.typography.labelMedium, color = Teal)
        when (step) {
            0 -> {
                Heading("Design preview", "Care that comes to you.", "Let’s set up your MyThuso account. It takes about two minutes, and you can stop at any point.")
                CareCard {
                    Text("Choose your language", style = MaterialTheme.typography.titleMedium)
                    ThusoLocale.entries.forEach { option ->
                        Row(
                            Modifier.fillMaxWidth().clickable { store.locale = option }.semantics { selected = store.locale == option },
                            verticalAlignment = Alignment.CenterVertically
                        ) { RadioButton(store.locale == option, { store.locale = option }); Text(option.native) }
                    }
                    Note("Navigation and the main actions are translated. Clinical wording stays in English until a clinical language review is complete.")
                }
                Button(onClick = { step = 1 }, Modifier.fillMaxWidth()) { Text("Create my account") }
                OutlinedButton(onClick = { recovering = true }, Modifier.fillMaxWidth()) { Text("I’ve lost access to my account") }
                TextButton(onClick = done) { Text("Skip and explore the design preview") }
            }
            1 -> {
                Heading("Your number", "What’s your number?", "We’ll send a one-time code. Your number is how nurses reach you on the day of a visit.")
                OutlinedTextField(phone, { phone = it.filter { c -> c.isDigit() }.take(10) }, label = { Text("Mobile number") }, prefix = { Text("+27 ") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), singleLine = true, modifier = Modifier.fillMaxWidth(),
                    isError = phone.isNotEmpty() && !phoneOk,
                    supportingText = { Text(if (phone.isEmpty() || phoneOk) "Standard network rates apply. We never share your number with advertisers." else "Enter a 10-digit South African mobile number, starting with 0.") })
                Note("In production this step is rate-limited and the code is bound to one device.")
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = { step = 0 }) { Text("Back") }
                    Button(onClick = { code = ""; codeError = ""; step = 2 }, enabled = phoneOk) { Text("Send my code") }
                }
            }
            2 -> {
                Heading("Verify", "Check your messages.", "In this preview the code is 240924.")
                OutlinedTextField(code, { code = it.filter { c -> c.isDigit() }.take(6); codeError = "" }, label = { Text("Verification code") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword), singleLine = true, modifier = Modifier.fillMaxWidth(),
                    isError = codeError.isNotEmpty(), supportingText = { if (codeError.isNotEmpty()) Text(codeError) })
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = { step = 1 }) { Text("Different number") }
                    Button(onClick = { if (code == "240924") step = 3 else codeError = "That code doesn’t match. Check the message and try again." }, enabled = code.length == 6) { Text("Verify") }
                }
            }
            3 -> {
                Heading("Identity", "Let’s confirm it’s you.", "Your identity number lets a nurse confirm the right patient at the door, and keeps someone else’s records out of your account.")
                OutlinedTextField(idNumber, { idNumber = it.filter { c -> c.isDigit() }.take(13) }, label = { Text("South African ID number") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword), singleLine = true, modifier = Modifier.fillMaxWidth(),
                    isError = idNumber.isNotEmpty() && !idCheck.first,
                    supportingText = { Text(if (idNumber.isEmpty()) "Use a fictional number for this preview — for example 8001015009087." else idCheck.second) })
                Note("Production verification runs against the Department of Home Affairs through an accredited provider, with a documented lawful basis. Nothing is verified here.")
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = { step = 2 }) { Text("Back") }
                    Button(onClick = { step = 4 }, enabled = idCheck.first) { Text("Continue") }
                }
                TextButton(onClick = { step = 4 }) { Text("I don’t have an SA ID number") }
            }
            4 -> {
                Heading("Recovery", "If you ever lose your phone.", "Two ways back in, so a lost handset never means losing your health history.")
                CareCard {
                    Text("Trusted family contact", style = MaterialTheme.typography.titleMedium)
                    listOf("Nomsa Molefe · Mother", "Thabo Molefe · Son", "I’ll add someone later").forEach { option ->
                        Row(
                            Modifier.fillMaxWidth().clickable { trusted = option }.semantics { selected = trusted == option },
                            verticalAlignment = Alignment.CenterVertically
                        ) { RadioButton(trusted == option, { trusted = option }); Text(option, style = MaterialTheme.typography.bodyMedium) }
                    }
                }
                OutlinedTextField(recoveryWord, { recoveryWord = it.take(24) }, label = { Text("Recovery word") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                    supportingText = { Text("Choose something memorable that isn’t your name, birthday or a family name.") })
                Note("A trusted contact can start recovery for you. They never see your records, and you are told every time recovery is attempted.")
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = { step = 3 }) { Text("Back") }
                    Button(onClick = { step = 5 }, enabled = recoveryWord.trim().length >= 3) { Text("Continue") }
                }
            }
            else -> {
                Heading("Consent", "Your choices, before we start.", "Two of these are needed to give you care. The third is entirely up to you.")
                CareCard {
                    Setting("I agree to MyThuso arranging home visits and holding the health information from them. (Required)", consentCare) { consentCare = it }
                    Setting("I have read how my information is used, stored and deleted under POPIA. (Required)", consentPopia) { consentPopia = it }
                    Setting("Send me optional health tips and product news.", consentUpdates) { consentUpdates = it }
                }
                Note("Consent is recorded with its version, wording and timestamp so you can see exactly what you agreed to, and withdraw it later.")
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = { step = 4 }) { Text("Back") }
                    Button(onClick = done, enabled = consentCare && consentPopia) { Text("Enter MyThuso") }
                }
            }
        }
        Note("Nothing you type here leaves your device. This preview creates no account.")
    }
}
@Composable fun RecoverAccessScreen(back: () -> Unit, done: () -> Unit) {
    var route by remember { mutableStateOf("") }
    var submitted by remember { mutableStateOf(false) }
    val routes = listOf(
        Triple("Code to my registered number", "Fastest, if you still have the SIM. A new code is sent to the number on the account.", "About 2 minutes"),
        Triple("Ask my trusted contact", "Nomsa Molefe confirms it’s you. She never sees your health records, and you both get told.", "Up to 24 hours"),
        Triple("In person at a Thuso Corner", "Bring your ID to a community site. Used when a number and a trusted contact are both gone.", "Same day, during opening hours")
    )
    ScreenColumn {
        Heading("Account recovery", "Getting you back in.", "Losing a phone shouldn’t mean losing your health history.")
        if (submitted) {
            CareCard {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Icon(Icons.Outlined.VerifiedUser, null, tint = Teal)
                    Text("We’ve started your recovery", style = MaterialTheme.typography.titleMedium)
                }
                ReviewLine("Reference", "REC-0042 · Demo")
                ReviewLine("Indicative wait", routes.first { it.first == route }.third)
                Note("Nothing was submitted. Production recovery is rate-limited, audited and reversible for a cooling-off period.")
            }
            Button(onClick = done, Modifier.fillMaxWidth()) { Text("Continue to the preview") }
        } else {
            routes.forEach { (title, body, wait) ->
                CareCard(Modifier.clickable { route = title }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(route == title, { route = title })
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                            Text(title, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyLarge)
                            Note(body)
                            Text(wait, style = MaterialTheme.typography.labelSmall, color = Teal)
                        }
                    }
                }
            }
            Note("Recovery never reveals your records to the person helping you.")
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = back) { Text("Back") }
                Button(onClick = { submitted = true }, enabled = route.isNotEmpty()) { Text("Start recovery") }
            }
        }
    }
}
@Composable fun LanguageScreen(store: PreviewStore) {
    ScreenColumn {
        Heading("Language", "Read MyThuso your way.", "Navigation, the shell and the main actions are translated.")
        CareCard {
            ThusoLocale.entries.forEach { option ->
                Row(
                    Modifier.fillMaxWidth().clickable { store.locale = option }.semantics { selected = store.locale == option },
                    verticalAlignment = Alignment.CenterVertically
                ) { RadioButton(store.locale == option, { store.locale = option }); Text(option.native) }
            }
        }
        Note("Clinical wording stays in English until a South African clinical language review is complete — a mistranslated instruction is a safety problem, not a polish problem.")
        Note("isiXhosa, Setswana, Sepedi, Xitsonga, siSwati, Tshivenda, isiNdebele and South African Sign Language guidance are planned before a pilot.")
    }
}
@Composable fun SystemStatesScreen() {
    var state by remember { mutableStateOf(LoadState.LOADING) }
    ScreenColumn {
        DemoBadge()
        Heading("Design review", "System states", "Every screen that will talk to a clinical, payment, partner or device integration needs these designed up front.")
        StatePicker("Choose a state", state) { state = it }
        CareCard {
            if (state == LoadState.READY) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Icon(Icons.Outlined.CheckCircle, null, tint = Teal)
                    Text("The real content, with nothing standing in for it.")
                }
            } else {
                StateBlock(state, "Your laboratory results", "Health Connect access", { state = LoadState.READY }) {}
            }
        }
        Text("Skeleton while care information loads", style = MaterialTheme.typography.titleMedium)
        CareCard { SkeletonRows() }
        Text("Nothing here yet", style = MaterialTheme.typography.titleMedium)
        EmptyStateCard("No visits yet", "When you book your first visit it appears here, with the nurse’s name and what to have ready.")
        Note("An error state never blames the patient, never loses what they typed, and always says what happens next.")
    }
}
