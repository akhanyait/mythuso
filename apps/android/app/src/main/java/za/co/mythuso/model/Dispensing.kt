package za.co.mythuso.model

import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/* Substitution, and how long a repeat is allowed to live.

   A pharmacist hands over something other than what was written. A repeat runs out. Both are the
   most ordinary events in a pharmacy and both are where harm hides.

   The table itself — the three substitution classes, the ten grounds, what a substitution may and
   may not change, the six rules, the six refusals, the chronic authorisation and one fictional
   prescription of five items — is generated into DispensingData.kt from
   packages/catalog/dispensing.json, so nothing below is transcribed by hand.

   What is here is the reasoning, and it is worth saying why there are three classes rather than
   two. Section 22F of the Medicines and Related Substances Act 101 of 1965 does not permit generic
   substitution: it requires the pharmacist to tell the patient about an interchangeable multi-source
   medicine and to dispense it, unless the patient forbids it, the prescriber wrote "no substitution"
   in their own hand, the regulator has declared it not substitutable, or the alternative costs the
   patient more. So the lowest class is "may be substituted, and the patient is told". A silent swap
   is not the mild end of this feature; it is outside it, and there is nowhere in this file to
   express one.

   The arithmetic is the other half. A chronic authorisation is boxed twice — by a date and by a
   number of repeats — and it ends on whichever arrives first. Neither is written down as a
   conclusion: the contract carries the day it was authorised and the months it runs for, and the
   expiry is computed here, in Dispensing.swift and in apps/web/src/lib/dispensing.ts from the same
   two numbers, so three platforms cannot disagree about the day a repeat stops.

   Nothing here dispenses anything. No pharmacy is contacted, no medicine exists, and every patient,
   pharmacist and product below is fictional. None of the clinical wording has been read by a
   pharmacist. */

data class SubstitutionClass(
    val id: String,
    val name: String,
    /** For a pill on a crowded item card, where the full name will not fit and must not be invented. */
    val shortName: String,
    val detail: String,
    val whoDecides: String,
    /** The middle class, and only the middle class, is a decision that has to be written down. */
    val needsWrittenReason: Boolean,
    val tellsThePrescriber: Boolean,
    val tone: String
)

data class SubstitutionGround(
    val id: String,
    val name: String,
    /** The four grounds the Act itself names carry a section number; the clinical ones do not. */
    val section: String?,
    val classId: String,
    val detail: String
)

data class MedicineChange(val what: String, val why: String)
data class DispensingRule(val id: String, val title: String, val sentence: String)
data class DispensingRefusal(val id: String, val sentence: String)
data class HandoverStep(val id: String, val label: String, val detail: String)

/** A substitution is not anonymous. This is the name and registration it is signed with. */
data class DispensingPharmacist(val name: String, val registration: String, val role: String)

data class PrescriptionItem(
    val id: String,
    val prescribed: String,
    val molecule: String,
    val strength: String,
    val form: String,
    val dose: String,
    val quantity: String,
    val classId: String,
    val ground: String,
    val secondGround: String?,
    /** "substituted", "as-written" or "refused-by-patient". */
    val outcome: String,
    val dispensed: String,
    val sameness: List<String>,
    val differences: List<String>,
    /** What is actually said to the patient. Not a label on a box. */
    val patientWords: String,
    val writtenReason: String?,
    val accepted: Boolean,
    val note: String
) {
    val wasSubstituted: Boolean get() = outcome == "substituted"
    val patientRefused: Boolean get() = outcome == "refused-by-patient"
}

/* No patient and no prescriber. The one screen that reads this is the pharmacy's, and
   medicines.json#partnerQueue.neverCarries lists both, so scripts/emit-dispensing.mjs leaves them out
   of the app altogether rather than leaving them here for a screen to draw. */
data class DispensedPrescription(
    val reference: String,
    val issuedInDays: Int,
    /** A vetting subject id: the pharmacy is the reader's own, so it may be named. */
    val pharmacy: String,
    val pharmacist: DispensingPharmacist,
    val items: List<PrescriptionItem>
) {
    val substituted: List<PrescriptionItem> get() = items.filter { it.wasSubstituted }
}

data class ChronicAuthorisation(
    val reference: String,
    val programme: String,
    val condition: String,
    val authorisedByDays: Int,
    val validMonths: Int,
    val repeatsAuthorised: Int,
    val repeatsUsed: Int,
    val daysPerRepeat: Int,
    val minimumDaysBetween: Int,
    val lastCollectedDays: Int,
    val reviewedBy: String,
    val endsWith: String,
    val note: String,
    val quantityNote: String
)

object Dispensing {
    fun substitutionClass(id: String) = substitutionClasses.firstOrNull { it.id == id } ?: substitutionClasses.first()
    fun ground(id: String) = substitutionGrounds.firstOrNull { it.id == id } ?: substitutionGrounds.first()
    fun rule(id: String) = dispensingRules.firstOrNull { it.id == id } ?: dispensingRules.first()
    fun refusal(id: String) = dispensingRefusals.firstOrNull { it.id == id } ?: dispensingRefusals.first()

    /** The four exceptions in section 22F, derived rather than listed a second time: a ground that
     *  stops carrying a section number drops out of here by itself. */
    val statutoryGrounds: List<SubstitutionGround> get() = substitutionGrounds.filter { it.section != null }

    /* ---- The authorisation, boxed twice -----------------------------------------------------
       The month is the same 30.44 days the vetting module renews a credential on, so an
       authorisation and a check that both run for six months run out on the same day. */
    const val daysPerMonth = 30.44
    val expiresInDays: Int
        get() = chronicAuthorisation.authorisedByDays + (chronicAuthorisation.validMonths * daysPerMonth).roundToInt()
    val repeatsRemaining: Int get() = chronicAuthorisation.repeatsAuthorised - chronicAuthorisation.repeatsUsed
    val daysOfMedicineLeft: Int get() = repeatsRemaining * chronicAuthorisation.daysPerRepeat

    /** Which box closes first. Where it is the date, some of what was authorised cannot be collected
     *  at all, and the screen says so rather than letting a patient plan on it. */
    val bindsOnDate: Boolean get() = expiresInDays < daysOfMedicineLeft
    val repeatsCollectableBeforeExpiry: Int
        get() = min(repeatsRemaining, max(0, expiresInDays / chronicAuthorisation.daysPerRepeat))
    val strandedRepeats: Int get() = repeatsRemaining - repeatsCollectableBeforeExpiry

    /** Said before the last pack is handed over, not at the counter the month after. */
    val isFinalRepeat: Boolean get() = repeatsRemaining == 1

    val nextCollectionInDays: Int
        get() = chronicAuthorisation.lastCollectedDays + chronicAuthorisation.minimumDaysBetween

    /* An early collection is refused with a date, not with a shrug. The days between collections
       belong to the authorisation rather than to the person collecting: somebody accumulating a
       chronic medicine at home is the first thing anybody would want to notice. */
    data class CollectionAnswer(val allowed: Boolean, val reason: String)

    val collectionAnswer: CollectionAnswer
        get() {
            val auth = chronicAuthorisation
            if (repeatsRemaining <= 0) return CollectionAnswer(
                false,
                "Every repeat on ${auth.reference} has been used. It ends here, in a review — nothing renews on its own."
            )
            if (expiresInDays < 0) return CollectionAnswer(
                false,
                "${auth.reference} expired ${-expiresInDays} days ago. A repeat cannot be collected against it, and extending it is a doctor's decision rather than this screen's."
            )
            if (nextCollectionInDays > 0) return CollectionAnswer(
                false,
                "The last thirty days were collected ${-auth.lastCollectedDays} days ago and this authorisation allows one collection every ${auth.minimumDaysBetween} days. The next is due in $nextCollectionInDays days — and the question worth asking first is how the last month went."
            )
            return CollectionAnswer(
                true,
                "One repeat of ${auth.daysPerRepeat} days may be collected today. $repeatsRemaining of ${auth.repeatsAuthorised} remain."
            )
        }

    /* The prescriber as a partner is allowed to know them: the vetting register's answer, and not who
       they are. medicines.json#partnerQueue.neverCarries lists prescriberRef, so the pharmacy's
       substitution screen and the prescription or laboratory order a partner opens draw this where a
       name and an HPCSA number were. The words are dispensing.json#partner's and the checks' names
       vetting.json's, so it reads exactly as Dispensing.swift and apps/web/src/lib/dispensing.ts read it. */
    fun prescriberStanding(decision: VettingDecision): String =
        if (decision.allowed) DispensingPartner.prescriberMay
        else DispensingPartner.prescriberMayNot.replace(
            "{checks}",
            decision.blockedBy.joinToString(DispensingPartner.checksJoinedBy) { it.name }.ifEmpty { DispensingPartner.noCheckNamed }
        )

    /* The prescriber as a partner reads them, through the system admin's setting and nowhere else. The founder
       decided on 2 October 2026 that a pharmacist sees the prescriber and made it the admin's to change
       (medicines.json's partner-sees-prescriber-identity; partnerQueue.carriesWhenSet). This phone has no admin
       surface, so it reads the default scripts/emit-dispensing.mjs wrote into DispensingPartner.seesPrescriberIdentity,
       and the screen says so in DispensingPartner.settingPhone. The name and registration are read here, off the
       register's own subject, only while that says yes; the standing is drawn either way, because a name is not a
       licence. It reads exactly as Dispensing.swift and apps/web/src/lib/dispensing.ts read it. */
    fun prescriberAsPartnerSees(subject: VettingSubject?, decision: VettingDecision): String {
        val standing = prescriberStanding(decision)
        if (!DispensingPartner.seesPrescriberIdentity || subject == null) return standing
        return DispensingPartner.prescriberNamed.replace("{name}", subject.name)
            .replace("{registration}", subject.reference)
            .replace("{standing}", standing)
    }

    /* What the patient is owed, in words. Assembled here rather than in the composable so that
       Android, iOS and the web say the same three things: this is a substitution, this is what it
       replaces, this is what will look different. */
    fun headline(item: PrescriptionItem) = when {
        item.wasSubstituted -> "This is not what was written on your prescription"
        item.patientRefused -> "You were offered a swap and said no"
        else -> "This is exactly what was written on your prescription"
    }
}
