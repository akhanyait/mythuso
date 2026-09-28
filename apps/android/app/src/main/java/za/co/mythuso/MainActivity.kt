package za.co.mythuso

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectableGroup
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
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.size
import za.co.mythuso.model.CareService
import za.co.mythuso.model.FileBook
import za.co.mythuso.model.Phrase
import za.co.mythuso.model.PreviewStore
import za.co.mythuso.model.thuso
import za.co.mythuso.model.services
import za.co.mythuso.ui.*

class MainActivity : ComponentActivity() {
    /* The store is held by the activity as well as by the composition, because onStop needs
       something to flush. Both ledgers write on a thread of their own now — see LedgerWriter — so
       the newest change can be a few milliseconds behind the disk, and backgrounding is the moment
       before a process is most likely to be killed. It is closed here rather than left open. */
    private val store by lazy { PreviewStore(FileBook(filesDir), FileBook(filesDir, "visit-parts.json")) }
    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); enableEdgeToEdge(); setContent { ThusoTheme { MyThusoApp(store, intent.getStringExtra("open")) } } }
    override fun onStop() { super.onStop(); store.flushLedgersToDisk() }
}

/* One destination, described once, so the bottom bar and the rail cannot disagree about what the
   app contains. A tablet gets the same five places down the side rather than a phone layout
   stretched across 900dp. */
private data class Destination(val key: String, val icon: androidx.compose.ui.graphics.vector.ImageVector?, val phrase: Phrase?, val drawable: Int? = null)

/* The patient's four places take the MyThuso icon family, as the web's patient shell does — dashboard,
   quick, visit, health — and More takes the utility overflow glyph, which is Lucide's on the web and
   Material's here. A workspace section keeps the Material glyph its own screen opens on. Never both for
   one concept: a destination has a drawable or a vector, not a choice between them. */
@Composable private fun DestinationIcon(destination: Destination) {
    val drawable = destination.drawable
    if (drawable != null) Icon(painterResource(drawable), null, modifier = Modifier.size(24.dp), tint = androidx.compose.ui.graphics.Color.Unspecified)
    else if (destination.icon != null) Icon(destination.icon, null)
}

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

/* `initial` is a design-review door: `adb shell am start … --es open "Thuso Kit"` opens the preview on a
   route, so a screenshot of a screen deep in a workspace does not need twelve taps first. It opens what a
   tap would open and nothing a tap could not — a tab, a detail route, "Book care: <service id>" for the
   booking sheet, or "GilbertOne sheet" — and the preview has no account for it to bypass. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun MyThusoApp(store: PreviewStore = rememberPreviewStore(), initial: String? = null) {
    val tabKeys = listOf("Home", "Book care", "Visits", "Passport", "More")
    val bookingOf = initial?.takeIf { it.startsWith("Book care: ") }?.removePrefix("Book care: ")?.let { id -> services.firstOrNull { it.id == id } }
    var page by remember { mutableStateOf(if (initial != null && initial in tabKeys) initial else if (bookingOf != null) "Book care" else "Home") }
    /* The service a home shortcut chose, handed to the catalogue once and then cleared, so going
       back to Book care later does not reopen a booking nobody asked for. */
    var pendingService by remember { mutableStateOf<CareService?>(bookingOf) }
    var detail by remember { mutableStateOf<String?>(initial?.takeIf { it !in tabKeys && bookingOf == null && it != "GilbertOne sheet" }) }
    var onboarding by remember { mutableStateOf(false) }
    /* Which workspace is open, and which of its own sections. A clinical role used to navigate by
       the patient's tabs — Home, Book care, Visits, Passport, More — which is not what a nurse on a
       doorstep or an operator with three late visits is doing. While a workspace is open the bottom
       bar is that role's, and leaving it puts the patient's tabs back. */
    var workspace by remember { mutableStateOf<String?>(null) }
    /* GilbertOne's sheet, over whichever patient page is open. See ui/GilbertScreens.kt. */
    var askingGilbert by remember { mutableStateOf(initial == "GilbertOne sheet") }
    var section by remember { mutableStateOf("") }
    val tabs = listOf(
        Destination("Home", null, Phrase.HOME, R.drawable.ic_mythuso_dashboard),
        Destination("Book care", null, Phrase.BOOK_CARE, R.drawable.ic_mythuso_quick),
        Destination("Visits", null, Phrase.VISITS, R.drawable.ic_mythuso_visit),
        Destination("Passport", null, Phrase.PASSPORT, R.drawable.ic_mythuso_health),
        Destination("More", Icons.Outlined.MoreHoriz, Phrase.MORE)
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
        Surface(color = theme.background, modifier = Modifier.fillMaxSize()) {
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

    /* A NAVIGATION LABEL IS ONE LINE, AND IT IS NEVER CUT IN HALF.
       The bar used to give every item an equal fifth with Material's 8dp gutters and let a label take
       two lines. Two lines only help a label with a space in it: "Assessments" and "Teleconsultation"
       are one word each, wider than their slot, and Compose breaks a word that cannot fit — so the
       nurse's bar read "Assessment / s" and the doctor's "Teleconsultatio / n". A name split across two
       lines is not a name. The contract has no shorter form of either and this file does not invent
       one, and 13sp is already the type floor, so the width has to come from the layout: each item is
       as wide as its own label, and whatever the row has left over is shared out evenly. Only when the
       labels together are wider than the screen does every item fall back to an equal share and
       ellipsise — a whole word or an ellipsis, never half of one. The ellipsis is drawing only: the
       Text still carries the full label, so TalkBack reads the whole name. */
    val labelMeasurer = rememberTextMeasurer()
    val labelStyle = MaterialTheme.typography.labelSmall
    val labelWidths = destinations.map { destination ->
        with(LocalDensity.current) { labelMeasurer.measure(label(destination), labelStyle).size.width.toDp() }
    }

    /* The luminous ground, and it is the whole background rather than a band. It is a static brush:
       three pale tints drawn once, none of them darker than the floor every contrast figure in
       tokens.json is measured against. Nothing about it moves — a ground that drifts is a box that
       keeps changing under a thumb, and this is a phone somebody is holding on a doorstep. */
    /* The ground is the handoff's background, flat: its guidelines refuse gradients and glass, and a
       ground that drifts is a box that keeps changing under a thumb on a doorstep. */
    val logo = if (theme.dark) R.drawable.mythuso_logo_reversed else R.drawable.mythuso_logo
    Box(Modifier.fillMaxSize().background(theme.background)) {
        Row(Modifier.fillMaxSize()) {
            /* The rail is as wide as its longest label, from Material's 80dp up to two fifths of the
               window. The rail is where the largest type goes, and at twice the type an 80dp rail held
               four characters of "Teleconsultation" a line. Past two fifths the page itself is what
               gets squeezed, so the label ellipsises there instead. */
            val windowWidth = with(LocalDensity.current) { LocalWindowInfo.current.containerSize.width.toDp() }
            val railWidth = ((labelWidths.maxOrNull() ?: 0.dp) + ThusoSpacing.space24).coerceIn(80.dp, maxOf(80.dp, windowWidth * 0.4f))
            if (wide) NavigationRail(
                containerColor = Color.Transparent,
                header = {
                    /* 104 by 28 is the wordmark's own 366:98. It was 96 by 36, which is 2.7:1 —
                       the old raster carried its padding inside the file and the difference went
                       into that. The outlined artwork has none, so the frame has to be right. */
                    Image(
                        painterResource(logo), "MyThuso",
                        modifier = Modifier.padding(vertical = ThusoSpacing.space16).width(104.dp).height(28.dp)
                    )
                }
            ) {
                Spacer(Modifier.weight(1f))
                destinations.forEach { destination ->
                    NavigationRailItem(
                        selected = selectedKey == destination.key && detail == null,
                        onClick = { onSelect(destination.key) },
                        icon = { DestinationIcon(destination) },
                        modifier = Modifier.width(railWidth),
                        label = {
                            Text(
                                label(destination), maxLines = 1, softWrap = false, overflow = TextOverflow.Ellipsis,
                                textAlign = TextAlign.Center, style = labelStyle
                            )
                        },
                        colors = NavigationRailItemDefaults.colors(
                            selectedIconColor = theme.foreground, selectedTextColor = theme.foreground,
                            indicatorColor = theme.accent.tint(0.15f),
                            unselectedIconColor = theme.mutedForeground, unselectedTextColor = theme.mutedForeground
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
                                page == "Home" && !wide -> Image(painterResource(logo), "MyThuso", modifier = Modifier.width(126.dp).height(34.dp))
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
                            scrolledContainerColor = theme.surface,
                            titleContentColor = theme.foreground,
                            navigationIconContentColor = theme.foreground,
                            actionIconContentColor = theme.foreground
                        ),
                        scrollBehavior = scrollBehavior
                    )
                },
                bottomBar = {
                    /* Inside a staff workspace the pill is BrandInk rather than studioNight: the founder asked the
                       screens a clinician works in to stick to the logo, and the workspace is the one place this
                       bar is theirs. White on BrandInk 12.04, BrandInk on white 12.04, BodyText 7.58. */
                    /* The selected destination is a filled studioNight pill, which is what an active
                       row is everywhere else in this language and the same dark the one live card on
                       a screen takes. Material's default is a tinted lozenge in the primary container
                       colour; a lilac lozenge would have been the one place in the app where a tile
                       fill carried a label, and a lime one would fail the arithmetic outright. */
                    /* NavigationBar's own Surface and height, without its 8dp gutters between items: the
                       gutters are the width "Assessments" was short of. Each Material item still draws
                       its own indicator, ripple, selection semantics and 48dp target; it simply fills a
                       slot sized by the arithmetic above rather than an equal fifth. */
                    /* The bar is the surface with the border above it, as the web's patient shell draws
                       its bottom navigation: a line, not a shadow. The current place is the handoff's
                       active navigation item — the accent at 15% under the foreground. */
                    if (!wide) Surface(color = theme.surface) {
                        Column {
                        HorizontalDivider(color = theme.border)
                        BoxWithConstraints(
                            Modifier.fillMaxWidth().windowInsetsPadding(NavigationBarDefaults.windowInsets)
                        ) {
                            val room = maxWidth
                            val natural = labelWidths.map { maxOf(it + ThusoSpacing.space12, 64.dp + ThusoSpacing.space8) }
                            val total = natural.fold(0.dp) { sum, width -> sum + width }
                            val slots = if (total <= room) natural.map { it + (room - total) / natural.size }
                                        else natural.map { room / natural.size }
                            Row(Modifier.fillMaxWidth().height(80.dp).selectableGroup()) {
                                destinations.forEachIndexed { index, destination ->
                                    Row(Modifier.width(slots[index]).fillMaxHeight()) {
                            NavigationBarItem(
                                selected = selectedKey == destination.key && detail == null,
                                onClick = { onSelect(destination.key) },
                                icon = { DestinationIcon(destination) },
                                label = {
                                    Text(
                                        label(destination), maxLines = 1, softWrap = false,
                                        textAlign = TextAlign.Center, overflow = TextOverflow.Ellipsis,
                                        style = labelStyle
                                    )
                                },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = theme.foreground, selectedTextColor = theme.foreground,
                                    indicatorColor = theme.accent.tint(0.15f),
                                    unselectedIconColor = theme.mutedForeground, unselectedTextColor = theme.mutedForeground
                                )
                            )
                                    }
                                }
                            }
                        }
                        }
                    }
                }
            ) { padding ->
                Box(Modifier.padding(padding)) {
                    /* GilbertOne's orb floats on every patient page, and it used to float over whatever was
                       there — on the home it sat on the end of the search field. The web keeps it clear by
                       reserving room; here the patient pages stop 80dp short of the bar and the orb stands
                       in that band, so there is no scroll position on any patient screen where it covers a
                       control. The cost is 80dp of height on those pages, and it is paid on purpose. */
                    val orbBand = if (role == null && detail == null) 80.dp else 0.dp
                    Box(Modifier.fillMaxSize().padding(bottom = orbBand)) {
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
                    /* GilbertOne floats bottom right on every patient page and only on them, as on the web: its
                       questions are a patient's. It asks the phone for nothing; the sheet asks for the
                       microphone the first time somebody taps to talk. */
                    if (role == null && detail == null) GilbertOrb(Modifier.align(androidx.compose.ui.Alignment.BottomEnd)) { askingGilbert = true }
                }
                if (askingGilbert) GilbertSheet(store, onDismiss = { askingGilbert = false }, open = go)
            }
        }
    }
}
