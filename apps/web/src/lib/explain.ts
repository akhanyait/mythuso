import { conditionById } from './sos';
import { measureSpec, type MeasureId } from './passport';

/* What a reading means — written down, by a person, in English, and reviewed by nobody yet.
 *
 * The Health Passport has always rendered seven reference ranges and never said what any of them
 * measures. A number beside a range answers "is this inside the lines" and not the question a
 * person actually opened the screen with, which is "should I be worried". Left unanswered, that
 * question gets asked of a search engine, and a search engine will diagnose them.
 *
 * WHY THIS IS PROSE AND NOT A MODEL. `screening` is one of the fifteen capabilities and it is
 * blocked on a model, a vendor and a licence. It is also the easiest thing in this product to
 * overstate. A written explanation cannot be any of the things an unlicensed model would be: it
 * cannot see your record, it cannot personalise itself, it cannot be confidently wrong in a new way
 * for each reader, and it can be read in full by a clinician before it ships. When screening does
 * arrive it will have to be better than this, and this is what "better" will be measured against.
 *
 * THE LINE IT MUST NOT CROSS. Nothing here diagnoses. Each entry says what the measurement is, what
 * a number outside the range *may* follow from — including the ordinary, boring reasons, which are
 * usually the right ones — and what to do, which is nearly always "have it taken again" and never
 * "start, stop or change a medicine". Every entry ends at the same place: a registered doctor
 * decides what a reading means for a particular person, and this screen does not.
 *
 * WHAT IS DERIVED AND WHAT IS WRITTEN. Every label, unit and range comes from the assessment's own
 * observation table by way of lib/passport.ts, so the ranges a patient reads here and the ranges a
 * nurse is held to at a visit cannot become two different numbers. The urgent conditions are
 * pointers into packages/catalog/sos.json by id — the eight red flags that end the questions and
 * show the ambulance number — so this screen can never invent a ninth or soften one of the eight.
 * What is written is the explanation itself, and it belongs in packages/catalog/records.json beside
 * the observation section that already calls the ranges indicative, so that iOS and Android render
 * the same words rather than three people writing them again. It is here until it is there. */

export type Explanation = {
 id: MeasureId;
 /** What the instrument is actually measuring, in one sentence. */
 measures: string;
 /** What a reading above the range may follow from. Never what it is. */
 above: string;
 /** And below. For several of these the honest answer is "often nothing at all". */
 below: string;
 /** What a person can do about it today. Never a change to a medicine. */
 whatToDo: string;
 /** Ids in packages/catalog/sos.json's red flags. Rendered from the contract, never retyped. */
 urgent: string[];
};

export const explanations: Explanation[] = [
 {
  id: 'systolic',
  measures: 'The push of blood against your artery walls at the moment your heart squeezes. It is the first and larger of the two numbers in a blood-pressure reading.',
  above: 'A single high reading is common and is not high blood pressure on its own. Walking to the door, coffee, a cigarette, pain, a full bladder, a cuff that is too small for the arm or a dose taken late will all lift it. It can also be the first sign of high blood pressure, which is why the answer to one high reading is another reading rather than a decision.',
  below: 'A low systolic is often just how somebody is built, and is common in people who are young, fit or well hydrated. It is worth attention when it arrives with dizziness on standing, fainting, a racing heart or confusion.',
  whatToDo: 'Sit still for five minutes with your back supported and both feet on the floor, then have it taken again on the same arm. Keep the boxes of everything you take and show them to the nurse at the next visit — the commonest reason a reading moves is a dose that was missed, doubled or changed by somebody else.',
  urgent: ['chest-pain', 'stroke']
 },
 {
  id: 'diastolic',
  measures: 'The pressure still in your arteries between beats, while the heart is refilling. It is the second and smaller of the two numbers.',
  above: 'It tends to move with the first number and follows the same everyday things. On its own, one raised diastolic reading means the reading should be repeated, not that anything has been found.',
  below: 'Usually unremarkable, and often lower in people who are fit. It matters alongside symptoms — light-headedness when you stand, or feeling faint — rather than by itself.',
  whatToDo: 'It is taken in the same measurement as the first number, so the same thing applies: sit quietly, have it repeated, and bring your medicines to the visit so the nurse can see what you are actually taking.',
  urgent: ['chest-pain', 'stroke']
 },
 {
  id: 'pulse',
  measures: 'How many times your heart beats in a minute, counted while you are resting.',
  above: 'A fast resting pulse follows exertion, anxiety, pain, fever, dehydration, caffeine, some inhalers and some cold remedies. It settles as the cause does. A pulse that stays fast at rest, or that is irregular, is something a doctor should look at rather than something to watch alone.',
  below: 'A slow pulse is normal in people who are fit, and is expected with some heart and blood-pressure medicines. It is worth reporting if it comes with feeling faint, unusually tired or short of breath.',
  whatToDo: 'Sit for five minutes and have it counted again. If it is often irregular, say so at the next visit — the pattern over several visits tells a doctor far more than any single count.',
  urgent: ['chest-pain', 'breathing', 'unresponsive']
 },
 {
  id: 'respiratory',
  measures: 'How many breaths you take in a minute, counted while you are sitting quietly and, ideally, not thinking about it.',
  above: 'Breathing faster follows exercise, fever, pain, anxiety and a chest infection. It is one of the earliest things to change when somebody is becoming unwell, which is why a nurse counts it even when you feel fine.',
  below: 'Slow breathing at rest is usually nothing. It matters when somebody is unusually drowsy or difficult to wake, particularly if they are taking strong pain medicine.',
  whatToDo: 'If you are breathing faster than usual and it is not settling, book a visit rather than waiting for the next one. Bring the inhalers or chest medicines you use, if you use any.',
  urgent: ['breathing', 'unresponsive']
 },
 {
  id: 'temperature',
  measures: 'How warm your body is, taken with the same thermometer in the same place each time so that two visits can be compared.',
  above: 'A raised temperature is the body responding to something, most often an infection it will deal with. Where it was taken changes the number — under the arm reads lower than in the ear — so the place it was taken matters as much as the figure.',
  below: 'A low reading is often the thermometer, the room or a cold hand rather than the person. In an older adult, a genuinely low temperature alongside feeling unwell deserves the same attention a fever would.',
  whatToDo: 'Drink water, rest, and take it again in a few hours. A fever that lasts more than a couple of days, or one in a baby, is a reason to book a visit or see a doctor rather than to keep measuring.',
  urgent: ['infant', 'unresponsive', 'seizure']
 },
 {
  id: 'oxygen',
  measures: 'The share of your blood that is carrying oxygen, read through a fingertip by a clip that shines light through it.',
  above: 'There is no reading above this range to explain: the scale stops at a hundred.',
  below: 'A low reading is often the device rather than the person — cold hands, poor circulation, nail varnish, false nails, movement, or a finger that is not in it properly. It is worth knowing that these clips are less accurate on darker skin and have been found to read higher than the truth, so a borderline reading on a person who feels short of breath should be believed less than the person is.',
  whatToDo: 'Warm your hand, take off any nail varnish, sit still and try again on a different finger. If it stays low, or if you are breathless doing something you managed easily last week, book a visit.',
  urgent: ['breathing', 'unresponsive']
 },
 {
  id: 'glucose',
  measures: 'How much sugar is in your blood at the moment it was taken, from a drop of blood on a strip.',
  above: 'When you last ate changes this reading more than almost anything else, so a number taken after a meal is not the same measurement as one taken fasting, and the range here is the fasting one. A high reading is a reason to have it repeated properly, and repeatedly high readings are how diabetes is found — by a doctor, on more than one occasion, not on one strip.',
  below: 'A low reading matters sooner than a high one. It can follow a missed meal, alcohol, unusual exercise, or diabetes medicine taken without food. Shakiness, sweating, hunger, confusion or irritability alongside a low reading is the body asking for sugar now.',
  whatToDo: 'If it is low and you feel it, eat or drink something sugary and then something more substantial, and tell the nurse or a doctor that it happened. If it is high, note when you last ate and have it taken again fasting. Never change the dose of a diabetes medicine on the strength of a reading at home.',
  urgent: ['unresponsive', 'seizure']
 }
];

export const explanationFor = (id: MeasureId) => explanations.find(e => e.id === id);
/** The order the passport already reads them in, so the explanations and the charts agree. */
export const explainedMeasures = explanations.map(e => e.id);
/** The red flags an explanation points at, resolved through the emergency contract. */
export const urgentConditions = (explanation: Explanation) =>
 explanation.urgent.map(conditionById).filter((c): c is NonNullable<typeof c> => Boolean(c));
export const labelFor = (id: MeasureId) => measureSpec(id).label;

/* Where this text comes from and what it is not. Four sentences that have to be on the screen
   rather than in a policy: a reader deciding how much weight to give a paragraph about their own
   blood pressure is owed the provenance of it before the paragraph, not after. */
export const provenance = {
 written: 'Everything on this screen is written text held inside the app. Everybody sees the same words for the same reading, nothing here has read your record in order to write them, and no software has looked at your numbers and formed a view.',
 unreviewed: 'No clinician has reviewed this wording yet. It is written down rather than left unsaid so that a doctor can correct it — a paragraph somebody can argue with is worth more than a screen that explains nothing at all.',
 ranges: 'The ranges are the indicative adult ranges the nurse’s own assessment is held to. They are a guide for a healthy adult, not a validated early-warning score, and your own doctor may work to different numbers for you.',
 whoDecides: 'None of this is a diagnosis and none of it is advice about your treatment. A reading is one measurement, on one day, in one room. What it means for you is a clinical judgement, and it is made by the registered doctor who reviews your record.',
 neverChange: 'Nothing here is a reason to start, stop or change a medicine. That decision belongs to whoever prescribed it.'
} as const;
