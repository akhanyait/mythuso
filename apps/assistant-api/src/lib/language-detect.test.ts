import test from "node:test";
import assert from "node:assert/strict";
import {
  detectLanguage,
  languageName,
  LANGUAGE_NAMES,
  SUPPORTED_LANGUAGES,
} from "./language-detect.ts";

/* The language detector's own tests, added with it on 23 September 2026 (Phase 1A of the
   multi-language backend). The detector is a hint the turn route feeds the orchestrator's system
   prompt — never a decision about a person — so what is asserted here is the two promises it makes
   to that caller: a message clearly written in one of the supported South African languages is
   named as that language, and anything ambiguous, too short or unknown collapses onto the safe
   English default with a confidence of zero rather than a confident guess between close relatives.
   Each language gets at least one clearly-characteristic sentence; the shared-vocabulary cases at
   the end are the honest ones, proving the floor exists for a reason. */

/* One clearly-characteristic sentence per supported language. Each carries enough of the language's
   own distinctive sequences — its autonym, its click digraphs, its unique verb and noun forms — to
   pull clear of its neighbours, which is what a real message written in that language does. */
const CLEAR_CASES: [language: string, text: string][] = [
  ["en", "Hello, when is my nurse coming? I need help with my medicine."],
  ["en", "What are the side effects of this treatment? Please explain to me."],
  ["zu", "Ngiyabonga kakhulu. Ngicela usizo, umhlengikazi uzofika nini?"],
  ["zu", "Isizulu: ngiyagula, umzimba wami ubuhlungu, ngifuna udokotela."],
  ["xh", "Molo, enkosi. Ndiphilile. Ixesha lam lokuya kuGqirha namhlanje."],
  ["xh", "IsiXhosa: ndiyabona, ndicinga ukuba kunengxaki, umongikazi."],
  ["af", "Dankie, hoe gaan dit met jou? Ek is nie goed nie, ek het pyn."],
  ["af", "Asseblief, ek benodig 'n dokter. My verpleegster en medisyne."],
  ["st", "Dumela, o kae? Ke kopa thuso. Bophelo ba ka ha bo ntse hantle."],
  ["st", "Sesotho: ke a leboha, ke hloka ho bona ngaka sepetlele kajeno."],
  ["tn", "Dumela, o kae? Botlhokwa go bona ngaka kwa sepatelele, tswee."],
  ["tn", "Setswana: ke a leboga, ke tlhoka go ya ko ngakeng gompieno."],
  ["nso", "Dumela, o kae? Bjale ke nyaka thuso ya ngaka, bolwetse bja ka."],
  ["nso", "Sepedi: ke a leboga, gore ke tsebise ngaka ka nako ye ya bolwetse."],
  ["ts", "Xana ndzi ta kuma rihanyo? Ndza khomiwa, ndzi lava ku tiva nhlana."],
  ["ts", "Xitsonga: hina hi lava vutomi, ndzi ta hakela, swi tiveka kahle."],
  ["ss", "Sawubona, Siswati: umuntfu wami uyagula, siyabonga kakhulu."],
  ["ss", "Siswati: ngicela umuntfu wami, sihamba kakhulu, siyabonga."],
  ["ve", "Nda khou toda muthusa. Tshivenda: vhathu vha khou lwala, mutakalo."],
  ["ve", "Tshivenda: ndi a livhuwa, vhathu vha khou lwala, u khou toda ngaka."],
  ["nr", "Sawubona, ngibona yini? Isindebele: udokotela, ngitakwenta khona."],
  ["nr", "IsiNdebele: ngibona kufanele ngiye kudokotela, sikhona yini namhlanje?"],
];

test("a clearly-characteristic message in each supported language is named as that language", () => {
  for (const [expected, text] of CLEAR_CASES) {
    const reading = detectLanguage(text);
    assert.equal(
      reading.language,
      expected,
      `"${text}" should be read as ${expected}, not ${reading.language}`,
    );
    assert.ok(
      reading.confidence >= 0.7,
      `a clear ${expected} message clears the confidence floor (got ${reading.confidence})`,
    );
  }
});

test("every supported language is detected by at least one clear sentence", () => {
  const detected = new Set(CLEAR_CASES.map(([language]) => language));
  for (const language of SUPPORTED_LANGUAGES) {
    assert.ok(
      detected.has(language),
      `the clear cases must cover "${language}" — a supported language with no test is untested`,
    );
  }
});

test("English is detected as English, with a real confidence rather than the zero fallback", () => {
  const reading = detectLanguage(
    "Hello, I would like to know how to book a nurse for my mother.",
  );
  assert.equal(reading.language, "en");
  assert.ok(reading.confidence >= 0.7);
});

test("an empty message is the safe English default with a confidence of zero", () => {
  assert.deepEqual(detectLanguage(""), { language: "en", confidence: 0 });
  assert.deepEqual(detectLanguage("   "), { language: "en", confidence: 0 });
});

test("a message with nothing recognisable in it falls back to English at zero confidence", () => {
  assert.deepEqual(detectLanguage("xyz qqq zzz"), {
    language: "en",
    confidence: 0,
  });
  assert.deepEqual(detectLanguage("ok"), { language: "en", confidence: 0 });
});

test("a single ambiguous greeting shared across the Nguni languages is not guessed at", () => {
  /* "Sawubona" is a greeting isiZulu, siSwati and isiNdebele all share. One word that three
     languages claim alike is exactly the contested reading the floor exists to refuse: it comes
     back as the safe English default at zero confidence rather than a coin-flip between them. */
  const reading = detectLanguage("Sawubona");
  assert.equal(reading.language, "en");
  assert.equal(reading.confidence, 0);
});

test("a non-string input is the safe default rather than a thrown error on the hot path", () => {
  /* The detector runs on every turn before the model call; it must never be the reason a turn
     fails. A value that is not a string is answered like an empty one. */
  const reading = detectLanguage(undefined as unknown as string);
  assert.deepEqual(reading, { language: "en", confidence: 0 });
});

test("every reading carries a supported language and a confidence inside 0 to 1", () => {
  for (const [, text] of CLEAR_CASES) {
    const reading = detectLanguage(text);
    assert.ok(
      (SUPPORTED_LANGUAGES as readonly string[]).includes(reading.language),
      `"${reading.language}" is not a supported language`,
    );
    assert.ok(
      reading.confidence >= 0 && reading.confidence <= 1,
      `confidence ${reading.confidence} is outside 0 to 1`,
    );
  }
});

test("a confidence below the floor always travels with English, so a caller can trust the zero", () => {
  for (const text of ["Sawubona", "xyz", "", "Dumela", "hello there ok"]) {
    const reading = detectLanguage(text);
    if (reading.confidence < 0.7) {
      assert.equal(
        reading.language,
        "en",
        `a low-confidence reading must be English, not "${reading.language}"`,
      );
      assert.equal(reading.confidence, 0);
    }
  }
});

test("isiXhosa's click digraphs pull it clear of the other Nguni languages", () => {
  /* "xh", "ngc" and the "gq" of ugqirha are unique to isiXhosa among the Nguni group: a sentence
     built on them is read as Xhosa even without the autonym, which is the point of weighting the
     distinctive sequences above the shared vocabulary. */
  const reading = detectLanguage(
    "Ndidinga ukubona ugqirha, kukho ingxaki egqithisileyo namhlanje.",
  );
  assert.equal(reading.language, "xh");
});

test("Afrikaans' double negative and 'n article are read as Afrikaans, not English", () => {
  const reading = detectLanguage("Ek is nie seker nie, ek het 'n dokter nodig.");
  assert.equal(reading.language, "af");
  assert.ok(reading.confidence >= 0.7);
});

test("languageName names each supported code and falls back to English for anything else", () => {
  assert.equal(languageName("zu"), "isiZulu");
  assert.equal(languageName("xh"), "isiXhosa");
  assert.equal(languageName("af"), "Afrikaans");
  assert.equal(languageName("st"), "Sesotho");
  assert.equal(languageName("en"), "English");
  /* Case and surrounding space are forgiven, and an unknown or absent code is English — the safe
     default the sentence the orchestrator composes can always trust. */
  assert.equal(languageName("ZU"), "isiZulu");
  assert.equal(languageName(" zu "), "isiZulu");
  assert.equal(languageName("fr"), "English");
  assert.equal(languageName(undefined), "English");
  assert.equal(languageName(""), "English");
});

test("every supported language has a name a person would recognise", () => {
  for (const language of SUPPORTED_LANGUAGES) {
    assert.ok(
      LANGUAGE_NAMES[language] && LANGUAGE_NAMES[language].length > 0,
      `"${language}" has no display name`,
    );
  }
  assert.equal(LANGUAGE_NAMES.en, "English");
});
