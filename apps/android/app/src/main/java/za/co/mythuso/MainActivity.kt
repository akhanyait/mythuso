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
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
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

/* One destination, described once, so the bottom bar and the rail cannot disagree about what the
   app contains. A tablet gets the same five places down the side rather than a phone layout
   stretched across 900dp. */
private data class Destination(val key: String, val icon: androidx.compose.ui.graphics.vector.ImageVector, val phrase: Phrase?)

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
        Destination("Home", Icons.Outlined.Home, Phrase.HOME),
        Destination("Book care", Icons.Outlined.MedicalServices, Phrase.BOOK_CARE),
        Destination("Visits", Icons.Outlined.CalendarMonth, Phrase.VISITS),
        Destination("Passport", Icons.Outlined.FavoriteBorder, Phrase.PASSPORT),
        Destination("More", Icons.Outlined.GridView, Phrase.MORE)
    )
    BackHandler(enabled = onboarding || detail != null || workspace != null || page != "Home") {
        when {
            onboarding -> onboarding = false
            detail != null -> detail = null
            workspace != null -> workspace = null
            else -> page = "Home"
        }
    }
    val pages = tabs.map { it.key }
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
    /* A rail rather than a bottom bar in two cases.
       The first is width: 600dp is Material's own compact/medium boundary, and below it a thumb
       reaches the bottom of the screen while above it the bottom of the screen is a long way from
       where the hand is.
       The second is type. A navigation bar is 80dp tall whatever the reader has asked for, and one
       fifth of a 393dp phone is 78dp wide, so at the largest font scales "Book care" and "Passport"
       have nowhere to go: they came out as "Book c…", then as two lines spilling out of the top of
       the bar. A rail gives each label the width of the rail and as many lines as it needs, and it
       gives back the vertical space that is the scarce thing at that size. The reader who has asked
       for the largest type is exactly the reader who cannot afford a truncated label. */
    val fontScale = LocalDensity.current.fontScale
    val wide = LocalConfiguration.current.screenWidthDp >= 600 || fontScale >= 1.6f
    val destinations: List<Destination> =
        if (role == null) tabs
        else workspaceSections(role).map { Destination(it.name, it.icon, null) }
    val selectedKey = if (role == null) page else section
    val onSelect: (String) -> Unit = { key -> if (role == null) page = key else section = key; detail = null }
    fun label(destination: Destination) = destination.phrase?.let { thuso(it, store.locale) } ?: destination.key

    /* The bar reacts to the scroll rather than sitting on top of it: pinned, so it keeps its place,
       and given a ground of its own once the content has moved under it, which is what separates a
       title from the first card without drawing a line. */
    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()

    Box(Modifier.fillMaxSize().background(Canvas)) {
        if (onHome) Box(Modifier.fillMaxWidth().height(210.dp)) { HeroTexture() }
        Row(Modifier.fillMaxSize()) {
            if (wide) NavigationRail(
                containerColor = Color.White,
                header = {
                    Image(
                        painterResource(R.drawable.mythuso_logo), "MyThuso",
                        modifier = Modifier.padding(vertical = ThusoSpacing.space16).width(96.dp).height(36.dp)
                    )
                }
            ) {
                Spacer(Modifier.weight(1f))
                destinations.forEach { destination ->
                    NavigationRailItem(
                        selected = selectedKey == destination.key && detail == null,
                        onClick = { onSelect(destination.key) },
                        icon = { Icon(destination.icon, null) },
                        label = { Text(label(destination), maxLines = 3, textAlign = TextAlign.Center, style = MaterialTheme.typography.labelSmall) }
                    )
                }
                Spacer(Modifier.weight(1f))
            }
            Scaffold(
                modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
                containerColor = if (onHome) Color.Transparent else Canvas,
                topBar = {
                    TopAppBar(
                        title = {
                            when {
                                detail != null -> Text(detail!!, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                role != null -> Text("$role workspace", maxLines = 1, overflow = TextOverflow.Ellipsis)
                                page == "Home" && !wide -> Image(painterResource(R.drawable.mythuso_logo), "MyThuso", modifier = Modifier.width(126.dp).height(44.dp))
                                page != "Home" -> Text(label(tabs.first { it.key == page }), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        },
                        navigationIcon = {
                            if (detail != null) IconButton(onClick = { detail = null }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") }
                            else if (role != null) IconButton(onClick = { workspace = null }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Leave the $role workspace") }
                        },
                        actions = { if (role == null) IconButton(onClick = { detail = "Notifications" }) { Icon(Icons.Outlined.Notifications, "Notifications") } },
                        colors = TopAppBarDefaults.topAppBarColors(
                            containerColor = Color.Transparent,
                            scrolledContainerColor = Color.White,
                            titleContentColor = Ink,
                            navigationIconContentColor = Slate,
                            actionIconContentColor = Slate
                        ),
                        scrollBehavior = scrollBehavior
                    )
                },
                bottomBar = {
                    if (!wide) NavigationBar(containerColor = Color.White) {
                        destinations.forEach { destination ->
                            NavigationBarItem(
                                selected = selectedKey == destination.key && detail == null,
                                onClick = { onSelect(destination.key) },
                                icon = { Icon(destination.icon, null) },
                                /* Two lines rather than one. These labels are the locale contract's
                                   own words — "Book care", and longer in isiZulu and Sesotho — and
                                   at a raised font scale a single line turned that into "Book c…".
                                   A tab whose name has been cut in half is not a name. */
                                label = {
                                    Text(
                                        label(destination), maxLines = 2, softWrap = true,
                                        textAlign = TextAlign.Center, overflow = TextOverflow.Ellipsis,
                                        style = MaterialTheme.typography.labelSmall
                                    )
                                }
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
}
