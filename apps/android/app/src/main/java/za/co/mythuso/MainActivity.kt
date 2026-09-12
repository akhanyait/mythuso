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
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
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
    /* The store is held by the activity as well as by the composition, because onStop needs
       something to flush. Both ledgers write on a thread of their own now — see LedgerWriter — so
       the newest change can be a few milliseconds behind the disk, and backgrounding is the moment
       before a process is most likely to be killed. It is closed here rather than left open. */
    private val store by lazy { PreviewStore(FileBook(filesDir), FileBook(filesDir, "visit-parts.json")) }
    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); enableEdgeToEdge(); setContent { ThusoTheme { MyThusoApp(store) } } }
    override fun onStop() { super.onStop(); store.flushLedgersToDisk() }
}

/* One destination, described once, so the bottom bar and the rail cannot disagree about what the
   app contains. A tablet gets the same five places down the side rather than a phone layout
   stretched across 900dp. */
private data class Destination(val key: String, val icon: androidx.compose.ui.graphics.vector.ImageVector, val phrase: Phrase?)

/* The two queues are the only things this preview writes to the phone, so they are the only things
   that need somewhere to write. Both are read once, on the way in: a queue loaded a frame later is a
   queue that shows empty first, and an empty queue is the exact lie the rule about not losing a
   nurse's work exists to prevent. Two files rather than one, so a ledger that will not parse cannot
   take the other one with it.
   The activity passes its own store in. This default is for the test harness and the previews, which
   call MyThusoApp() with nothing and have no activity to flush from. */
@Composable private fun rememberPreviewStore(): PreviewStore {
    val context = LocalContext.current
    return remember(context) { PreviewStore(FileBook(context.filesDir), FileBook(context.filesDir, "visit-parts.json")) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun MyThusoApp(store: PreviewStore = rememberPreviewStore()) {
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
        Surface(color = StudioPaper, modifier = Modifier.fillMaxSize()) {
            Box(Modifier.systemBarsPadding()) { OnboardingScreen(store) { onboarding = false } }
        }
        return
    }
    val role = workspace
    /* The band of indigo bubbles that used to sit behind the greeting is gone. It was the right
       answer when the ground was a flat canvas and there was nothing else to look at; over the
       studio ground it is a second texture drawn on top of the first, in the one accent this palette
       no longer leads with, and the two argued along a hard edge 210dp down. HeroTexture still exists
       and is still what the onboarding illustrations sit on. */
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
    val wide = with(LocalDensity.current) { LocalWindowInfo.current.containerSize.width.toDp() } >= 600.dp || fontScale >= 1.6f
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

    /* The luminous ground, and it is the whole background rather than a band. It is a static brush:
       three pale tints drawn once, none of them darker than the floor every contrast figure in
       tokens.json is measured against. Nothing about it moves — a ground that drifts is a box that
       keeps changing under a thumb, and this is a phone somebody is holding on a doorstep. */
    Box(Modifier.fillMaxSize().background(studioGroundBrush())) {
        Row(Modifier.fillMaxSize()) {
            if (wide) NavigationRail(
                containerColor = Color.Transparent,
                header = {
                    /* 104 by 28 is the wordmark's own 366:98. It was 96 by 36, which is 2.7:1 —
                       the old raster carried its padding inside the file and the difference went
                       into that. The outlined artwork has none, so the frame has to be right. */
                    Image(
                        painterResource(R.drawable.mythuso_logo), "MyThuso",
                        modifier = Modifier.padding(vertical = ThusoSpacing.space16).width(104.dp).height(28.dp)
                    )
                }
            ) {
                Spacer(Modifier.weight(1f))
                destinations.forEach { destination ->
                    NavigationRailItem(
                        selected = selectedKey == destination.key && detail == null,
                        onClick = { onSelect(destination.key) },
                        icon = { Icon(destination.icon, null) },
                        label = { Text(label(destination), maxLines = 3, textAlign = TextAlign.Center, style = MaterialTheme.typography.labelSmall) },
                        colors = NavigationRailItemDefaults.colors(
                            selectedIconColor = StudioPaper, selectedTextColor = Charcoal,
                            indicatorColor = StudioNight, unselectedIconColor = StudioInkMuted, unselectedTextColor = StudioInkMuted
                        )
                    )
                }
                Spacer(Modifier.weight(1f))
            }
            Scaffold(
                modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
                containerColor = Color.Transparent,
                topBar = {
                    TopAppBar(
                        title = {
                            when {
                                detail != null -> Text(detail!!, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                role != null -> Text("$role workspace", maxLines = 1, overflow = TextOverflow.Ellipsis)
                                page == "Home" && !wide -> Image(painterResource(R.drawable.mythuso_logo), "MyThuso", modifier = Modifier.width(126.dp).height(34.dp))
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
                            scrolledContainerColor = GlassFloor,
                            titleContentColor = Charcoal,
                            navigationIconContentColor = Charcoal,
                            actionIconContentColor = Charcoal
                        ),
                        scrollBehavior = scrollBehavior
                    )
                },
                bottomBar = {
                    /* The selected destination is a filled studioNight pill, which is what an active
                       row is everywhere else in this language and the same dark the one live card on
                       a screen takes. Material's default is a tinted lozenge in the primary container
                       colour; a lilac lozenge would have been the one place in the app where a tile
                       fill carried a label, and a lime one would fail the arithmetic outright. */
                    if (!wide) NavigationBar(containerColor = SurfaceWhite) {
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
                                },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = StudioPaper, selectedTextColor = Charcoal,
                                    indicatorColor = StudioNight, unselectedIconColor = StudioInkMuted, unselectedTextColor = StudioInkMuted
                                )
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
