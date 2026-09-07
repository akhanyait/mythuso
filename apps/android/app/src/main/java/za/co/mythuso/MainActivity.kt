package za.co.mythuso

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.Image
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.CareService
import za.co.mythuso.model.FileBook
import za.co.mythuso.model.Phrase
import za.co.mythuso.model.PreviewStore
import za.co.mythuso.model.thuso
import za.co.mythuso.ui.*

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); enableEdgeToEdge(); setContent { ThusoTheme { MyThusoApp() } } }
}
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun MyThusoApp() {
    /* The capture queue is the one thing this preview writes to the phone, so it is the one thing
       that needs somewhere to write. It is read once, here, on the way in: a queue loaded a frame
       later is a queue that shows empty first, and an empty queue is the exact lie the rule about
       not losing a nurse's work exists to prevent. */
    val context = LocalContext.current
    val store = remember(context) { PreviewStore(FileBook(context.filesDir)) }
    var page by remember { mutableStateOf("Home") }
    /* The service a home shortcut chose, handed to the catalogue once and then cleared, so going
       back to Book care later does not reopen a booking nobody asked for. */
    var pendingService by remember { mutableStateOf<CareService?>(null) }
    var detail by remember { mutableStateOf<String?>(null) }
    var onboarding by remember { mutableStateOf(false) }
    /* Which workspace is open, and which of its own sections. A clinical role used to navigate by
       the patient's tabs — Home, Book care, Visits, Passport, More — which is not what a nurse on a
       doorstep or an operator with three late visits is doing. While a workspace is open the bottom
       bar is that role's, and leaving it puts the patient's tabs back. */
    var workspace by remember { mutableStateOf<String?>(null) }
    var section by remember { mutableStateOf("") }
    val tabs = listOf(
        Triple("Home", Icons.Outlined.Home, Phrase.HOME),
        Triple("Book care", Icons.Outlined.MedicalServices, Phrase.BOOK_CARE),
        Triple("Visits", Icons.Outlined.CalendarMonth, Phrase.VISITS),
        Triple("Passport", Icons.Outlined.FavoriteBorder, Phrase.PASSPORT),
        Triple("More", Icons.Outlined.GridView, Phrase.MORE)
    )
    BackHandler(enabled = onboarding || detail != null || workspace != null || page != "Home") {
        when {
            onboarding -> onboarding = false
            detail != null -> detail = null
            workspace != null -> workspace = null
            else -> page = "Home"
        }
    }
    val pages = tabs.map { it.first }
    val go: (String) -> Unit = { target ->
        val role = workspaceRoles.firstOrNull { target == "$it workspace" }
        when {
            role != null -> { workspace = role; section = workspaceSections(role).first().name; detail = null }
            target in pages -> { page = target; detail = null; workspace = null }
            else -> detail = target
        }
    }
    if (onboarding) {
        Surface(color = Canvas, modifier = Modifier.fillMaxSize()) {
            Box(Modifier.systemBarsPadding()) { OnboardingScreen(store) { onboarding = false } }
        }
        return
    }
    val role = workspace
    /* A band of the brand behind the greeting, not a field the height of the screen: it used to be
       470dp, which is most of a phone, and it sat behind a rotating promotion. */
    val onHome = page == "Home" && detail == null && role == null
    Box(Modifier.fillMaxSize().background(Canvas)) {
    if (onHome) Box(Modifier.fillMaxWidth().height(210.dp)) { HeroTexture() }
    Scaffold(
        containerColor = if (onHome) Color.Transparent else Canvas,
        topBar = {
            TopAppBar(
                title = {
                    when {
                        detail != null -> Text("MyThuso")
                        role != null -> Text("$role workspace")
                        page == "Home" -> Image(painterResource(R.drawable.mythuso_logo), "MyThuso", modifier = Modifier.width(138.dp).height(50.dp))
                    }
                },
                navigationIcon = {
                    if (detail != null) IconButton(onClick = { detail = null }) { Icon(Icons.Outlined.ArrowBack, "Back") }
                    else if (role != null) IconButton(onClick = { workspace = null }) { Icon(Icons.Outlined.ArrowBack, "Leave the $role workspace") }
                },
                actions = { if (role == null) IconButton(onClick = { detail = "Notifications" }) { Icon(Icons.Outlined.Notifications, "Notifications") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent)
            )
        },
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                if (role == null) tabs.forEach { (key, icon, phrase) ->
                    NavigationBarItem(
                        selected = page == key && detail == null,
                        onClick = { page = key; detail = null },
                        icon = { Icon(icon, null) },
                        label = { Text(thuso(phrase, store.locale)) }
                    )
                } else workspaceSections(role).forEach { entry ->
                    NavigationBarItem(
                        selected = section == entry.name && detail == null,
                        onClick = { section = entry.name; detail = null },
                        icon = { Icon(entry.icon, null) },
                        label = { Text(entry.name) }
                    )
                }
            }
        }
    ) { padding ->
        Box(Modifier.padding(padding)) {
            if (detail != null) DetailScreen(detail!!, store, go, { onboarding = true })
            else if (role != null) WorkspaceScreen(role, section, store, go)
            else when (page) {
                /* A shortcut carries the service it names into the catalogue, which opens straight
                   into that service's booking. Passing nothing means "show me everything". */
                "Home" -> HomeScreen(store, { service -> pendingService = service; page = "Book care" }, go, { onboarding = true })
                "Book care" -> ServicesScreen(store, pendingService) { pendingService = null }
                "Visits" -> VisitsScreen(store, go)
                "Passport" -> PassportScreen(go)
                else -> MoreScreen(go, { onboarding = true })
            }
        }
    }
    }
}
