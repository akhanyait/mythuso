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
    val tabs = listOf(
        Triple("Home", Icons.Outlined.Home, Phrase.HOME),
        Triple("Book care", Icons.Outlined.MedicalServices, Phrase.BOOK_CARE),
        Triple("Visits", Icons.Outlined.CalendarMonth, Phrase.VISITS),
        Triple("Passport", Icons.Outlined.FavoriteBorder, Phrase.PASSPORT),
        Triple("More", Icons.Outlined.GridView, Phrase.MORE)
    )
    BackHandler(enabled = onboarding || detail != null || page != "Home") {
        when {
            onboarding -> onboarding = false
            detail != null -> detail = null
            else -> page = "Home"
        }
    }
    val pages = tabs.map { it.first }
    val go: (String) -> Unit = { target -> if (target in pages) { page = target; detail = null } else detail = target }
    if (onboarding) {
        Surface(color = Canvas, modifier = Modifier.fillMaxSize()) {
            Box(Modifier.systemBarsPadding()) { OnboardingScreen(store) { onboarding = false } }
        }
        return
    }
    val onHome = page == "Home" && detail == null
    Box(Modifier.fillMaxSize().background(Canvas)) {
    if (onHome) Box(Modifier.fillMaxWidth().height(470.dp)) { HeroTexture() }
    Scaffold(
        containerColor = if (onHome) Color.Transparent else Canvas,
        topBar = {
            TopAppBar(
                title = { if (detail == null && page == "Home") Image(painterResource(R.drawable.mythuso_logo), "MyThuso", modifier = Modifier.width(138.dp).height(50.dp)) else if (detail != null) Text("MyThuso") },
                navigationIcon = { if (detail != null) IconButton(onClick = { detail = null }) { Icon(Icons.Outlined.ArrowBack, "Back") } },
                actions = { IconButton(onClick = { detail = "Notifications" }) { Icon(Icons.Outlined.Notifications, "Notifications") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent)
            )
        },
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                tabs.forEach { (key, icon, phrase) ->
                    NavigationBarItem(
                        selected = page == key && detail == null,
                        onClick = { page = key; detail = null },
                        icon = { Icon(icon, null) },
                        label = { Text(thuso(phrase, store.locale)) }
                    )
                }
            }
        }
    ) { padding ->
        Box(Modifier.padding(padding)) {
            if (detail != null) DetailScreen(detail!!, store, go, { onboarding = true }) else when (page) {
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
