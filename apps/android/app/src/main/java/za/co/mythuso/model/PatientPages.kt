package za.co.mythuso.model

/* THE TWO PATIENT PAGES THIS PHONE DRAWS — the reasoning. The words are PatientPagesData.kt beside this
   file, generated from packages/catalog/patient-pages.json by scripts/emit-patient-pages.mjs; what is
   here is the little the phone has to decide for itself, which is where a door goes and what to count.

   A DOOR GOES TO A SCREEN THIS APP HAS, OR IT IS NOT DRAWN. The contract names its targets by the web's
   page names ("Live well", "Connected devices"), and the phone answers each with the native screen that
   is the same thing — or with nothing. The health library and community support are web pages; there is
   no native screen for either, and a web view is refused in this app, so the doors to them are left out
   rather than pointed at a placeholder that would read as the page. The contract records the same thing
   in drawnOn.android.leftOut, and scripts/check-boundaries.mjs holds the two to each other: a door the
   contract says is drawn must have a route here, and a door with no route here must be listed as left
   out there. The screen asks both, so a door neither side has agreed to is never drawn.

   THE ONE FIGURE IS A COUNT OF THE ROWS UNDER IT. The activity page shows how many Moving entries the
   journal holds, and lists those same entries below, from the same call — a reader who doubts the
   number can count it. Nothing else on either page is a number. */
object PatientPages {
    /* The web's page names, answered with the native routes AccountScreens.kt's DetailScreen opens.
       "Connected devices" is the Health Connect screen: on this phone that is where a request to link the
       phone's health store is recorded, which is the one real action the wearable door leads to. */
    private val nativeRoutes = mapOf(
        "Live well" to "Live well",
        "Connected devices" to "Health Connect",
        "Emergency & urgent care" to "Emergency & urgent care"
    )

    /* The web's session button opens the catalogue's roadmap entry for the counselling check-in. This
       phone's catalogue carries only the first phase's services, so there is no screen to open: the
       entry's own name and phase are shown where the button would be. Name the route here the day one
       exists, and the contract's drawnOn.android.leftOut loses sessionAction in the same change. */
    val catalogueRoute: String? = null

    /** The native route for a target the contract names, or null when this app has no such screen. */
    fun routeFor(target: String): String? = nativeRoutes[target]

    /** The mental-health doors this phone draws: not left out by the contract, and with somewhere to go. */
    val mentalHealthDoors: List<PatientPagesData.Door>
        get() = PatientPagesData.MentalHealth.doors.filter { door ->
            door.id !in PatientPagesData.MentalHealth.doorsLeftOut &&
                (door.kind == "anchor" || routeFor(door.target) != null)
        }

    /** Whether the session block carries its catalogue button. */
    val sessionActionDrawn: Boolean
        get() = PatientPagesData.MentalHealth.Session.actionDrawn && catalogueRoute != null

    /* The two wellbeing refusals the pages render, read from the generated WellbeingData by the ids the
       contract's derivations name. Thrown on when one does not resolve: a refusal that quietly renders as
       nothing is the refusal going missing, and the build's derivation check should have caught it first. */
    val moodRefusal: String
        get() = WellbeingData.refusal(PatientPagesData.MentalHealth.Mood.refusal)?.sentence
            ?: error("wellbeing.json has no refusal ${PatientPagesData.MentalHealth.Mood.refusal}")
    val noDevice: String
        get() = WellbeingData.refusal(PatientPagesData.Activity.refusal)?.sentence
            ?: error("wellbeing.json has no refusal ${PatientPagesData.Activity.refusal}")

    /** What a crisis line is for, joined by name to CrisisLinesData, which alone carries the numbers. */
    fun whenToUse(line: GilbertLine): String = PatientPagesData.MentalHealth.Crisis.whenToUse[line.name].orEmpty()

    /** The journal's Moving entries, newest first — the rows the activity page lists and the count counts. */
    fun moving(entries: List<WellbeingEntry>): List<WellbeingEntry> =
        Wellbeing.ordered(entries.filter { it.habit == PatientPagesData.Activity.habit })

    /** A tile's value: its written state, or the number of entries listed under it. */
    fun tileValue(tile: PatientPagesData.Tile, counted: Int): String =
        if (tile.value == PatientPagesData.Activity.COUNTED) "$counted" else tile.value
}
