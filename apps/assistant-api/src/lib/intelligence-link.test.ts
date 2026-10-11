import test from "node:test";
import assert from "node:assert/strict";
import localesContract from "../../../../packages/catalog/locales.json" with { type: "json" };
import federation from "../../../../packages/catalog/knowledge/federation.json" with { type: "json" };
import { LOCAL_KNOWLEDGE_FILES } from "./knowledge.ts";
import { catalogueFilesOnDisk, intelligenceSources } from "./intelligence-link.ts";
import {
  languageInScope,
  resolveTurnLanguage,
  SUPPORTED_LANGUAGES,
} from "./language-detect.ts";

test("every catalogue knowledge file is linked, and no extra file is searched", () => {
  const onDisk = catalogueFilesOnDisk();
  const linked = [...LOCAL_KNOWLEDGE_FILES].sort();
  assert.deepEqual(linked, onDisk);
  assert.equal(onDisk.length, 9);
});

test("every federation source is linked, and only an active one is consulted", () => {
  const sources = intelligenceSources();
  const external = sources.filter((source) => source.kind === "federation");
  assert.deepEqual(
    external.map((source) => source.id),
    federation.sources.map((source) => source.id),
  );
  for (const source of federation.sources) {
    const linked = external.find((row) => row.id === source.id);
    assert.equal(linked?.linked, true, source.id);
    assert.equal(linked?.consulted, source.active === true, source.id);
  }
  assert.equal(external.some((source) => source.consulted), false);
  const catalogue = sources.filter((source) => source.kind === "catalogue");
  assert.equal(catalogue.length, LOCAL_KNOWLEDGE_FILES.length);
  assert.ok(catalogue.every((source) => source.consulted));
});

test("MyThuso's eleven locales are GilbertOne's language scope, and nothing outside it is obeyed", () => {
  const locales = localesContract.locales.map((locale) => locale.code);
  assert.equal(locales.length, SUPPORTED_LANGUAGES.length);
  const subtags = locales.map((code) => languageInScope(code));
  assert.ok(subtags.every((code) => code !== undefined));
  assert.deepEqual(new Set(subtags), new Set(SUPPORTED_LANGUAGES));
  assert.equal(languageInScope("zu-ZA"), "zu");
  assert.equal(languageInScope("ZU"), "zu");
  assert.equal(languageInScope("en"), "en");
  assert.equal(languageInScope("fr"), undefined);
  assert.equal(languageInScope("en-US"), undefined);
  assert.equal(languageInScope(""), undefined);
  assert.equal(resolveTurnLanguage("zu-ZA", "Hello, when is my nurse coming?"), "zu");
  assert.equal(
    resolveTurnLanguage("fr", "Ngiyabonga kakhulu. Ngicela usizo, umhlengikazi uzofika nini?"),
    "zu",
  );
});
