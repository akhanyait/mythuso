package za.co.mythuso

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.Image
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.Phrase
import za.co.mythuso.model.PreviewStore
import za.co.mythuso.model.thuso
import za.co.mythuso.ui.*

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); enableEdgeToEdge(); setContent { ThusoTheme { MyThusoApp() } } }
}
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun MyThusoApp() {
    val store = remember { PreviewStore() }
    var page by remember { mutableStateOf("Home") }
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
    if (onboarding) {
        Surface(color = Canvas, modifier = Modifier.fillMaxSize()) {
            Box(Modifier.systemBarsPadding()) { OnboardingScreen(store) { onboarding = false } }
        }
        return
    }
    Scaffold(
        containerColor = Canvas,
        topBar = {
            TopAppBar(
                title = { if (detail == null && page == "Home") Image(painterResource(R.drawable.mythuso_logo), "MyThuso", modifier = Modifier.width(145.dp).height(52.dp)) else Text(if (detail != null) "MyThuso" else page) },
                navigationIcon = { if (detail != null) IconButton(onClick = { detail = null }) { Icon(Icons.Outlined.ArrowBack, "Back") } },
                actions = { IconButton(onClick = { detail = "Notifications" }) { Icon(Icons.Outlined.Notifications, "Notifications") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Canvas)
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
            if (detail != null) DetailScreen(detail!!, store, { detail = it }, { onboarding = true }) else when (page) {
                "Home" -> HomeScreen(store, { page = "Book care" }, { detail = it }, { onboarding = true })
                "Book care" -> ServicesScreen(store)
                "Visits" -> VisitsScreen(store) { detail = it }
                "Passport" -> PassportScreen { detail = it }
                else -> MoreScreen({ detail = it }, { onboarding = true })
            }
        }
    }
}
