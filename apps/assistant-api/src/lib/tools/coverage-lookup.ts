import { z } from "zod";
import { tool } from "@langchain/core/tools";
import geography from "../../../../../packages/catalog/geography.json" with { type: "json" };

/* The coverage-lookup tool. A patient asking "is there a clinic near me" or "where's the nearest
   pharmacy" is asking a question this codebase cannot honestly answer from data it holds:
   packages/catalog/geography.json is the one Johannesburg every platform draws its map from, and
   what it carries is dispatch reachability — five named suburbs, their working radius, and the
   phase-one sentence that says coverage stops at their edge. It carries no public clinic, no
   pharmacy, no address and no opening hours for any real facility, named or otherwise; the whole
   file exists, its own note says, so distance, projection and coverage stay in one place rather
   than three apps each inventing their own city. A tool that answered "find me a clinic" by
   returning a suburb's centre point dressed up as a result would be exactly the failure this
   codebase is built to refuse: a health screen that overstates what it knows. So this tool answers
   the question the catalog can actually answer — whether an area sits inside MyThuso's simulated
   home-visit coverage — and every reply says, in the same breath, that it is not a facility
   directory and never invents one. */

type ZoneEntry = { id: string; name: string; at: { lat: number; lng: number }; radiusKm: number };
type GeographyRefusal = { id: string; sentence: string; why: string };

const ZONES = geography.zones as ZoneEntry[];
const COVERAGE = geography.coverage as {
  city: string;
  province: string;
  phase: number;
  sentence: string;
  whyOneCity: string;
};

/* The "not working there yet" sentence is geography.json's own outside-coverage refusal — the
   same one sos.json and shop.json point at for the same reason (an ambulance, a booking and a
   delivery are all held to the same phase-one boundary). Read from the catalog rather than typed
   here, so a reworded refusal cannot drift between the places that say it. */
const OUTSIDE_COVERAGE_SENTENCE =
  (geography.refusals as GeographyRefusal[]).find((entry) => entry.id === "outside-coverage")
    ?.sentence ?? "MyThuso is not working in that area yet.";

const ZONE_NAMES = ZONES.map((zone) => zone.name).join(", ");

const normalise = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/* A zone matches a free-text query on an exact name, or on containment either way once both sides
   clear a minimum length — long enough that "a" or "in" cannot match every zone, short enough that
   "clinic near Melville" still finds Melville. */
const matchZones = (query: string): ZoneEntry[] => {
  const q = normalise(query);
  if (!q) return [];
  const exact = ZONES.filter((zone) => normalise(zone.name) === q);
  if (exact.length) return exact;
  return ZONES.filter((zone) => {
    const name = normalise(zone.name);
    return (q.includes(name) && name.length >= 4) || (name.includes(q) && q.length >= 4);
  });
};

/* Said on every answer, matched or not: the boundary this tool exists to hold. Coverage is not a
   facility, and this codebase does not pretend a suburb's dispatch radius is a clinic's front
   door. */
const NOT_A_DIRECTORY = [
  "This is coverage-area information for MyThuso's simulated home-visit dispatch, not a directory of real clinics or pharmacies.",
  "MyThuso's catalog holds no named public clinic, pharmacy, address or opening hours anywhere — only the suburbs its own dispatch works in.",
  "For an actual facility nearby, your nearest public clinic or the National Department of Health's own facility listings are the honest place to look; this tool does not carry that list.",
].join(" ");

export function lookupCoverage(area: string): string {
  const query = (area ?? "").trim();
  if (!query)
    return [
      "Name a suburb or area and I will say whether it is inside MyThuso's phase-one coverage — not whether a clinic or pharmacy is there, which this catalog does not record.",
      "Sources: MyThuso geography catalog (5 phase-one zones).",
    ].join("\n");

  const matches = matchZones(query);

  if (!matches.length) {
    return [
      OUTSIDE_COVERAGE_SENTENCE,
      `Phase one is ${COVERAGE.city.toLowerCase() === "johannesburg" ? "northern Johannesburg and Soweto" : `${COVERAGE.city}, ${COVERAGE.province}`} — by name: ${ZONE_NAMES}. Everywhere else on MyThuso's map is drawn because it is there, not because dispatch reaches it.`,
      "",
      NOT_A_DIRECTORY,
      "Sources: MyThuso geography catalog (5 phase-one zones).",
    ].join("\n");
  }

  const names = matches.map((zone) => zone.name).join(" and ");
  return [
    `${names} ${matches.length === 1 ? "is" : "are"} inside MyThuso's phase-one coverage area (${COVERAGE.city}, ${COVERAGE.province}) — the simulated home-visit dispatch in this preview can reach it.`,
    COVERAGE.sentence,
    "",
    NOT_A_DIRECTORY,
    "If this is urgent, call 10177 (112 from a cellphone) rather than searching for a facility.",
    "Sources: MyThuso geography catalog (5 phase-one zones).",
  ].join("\n");
}

export const coverageLookupTool = tool(
  async ({ area }) => lookupCoverage(area),
  {
    name: "coverage_lookup",
    description:
      "Say whether a named suburb or area sits inside MyThuso's phase-one coverage (the zones its simulated home-visit dispatch can reach) — never a directory of real clinics or pharmacies, which MyThuso's catalog does not hold. Use when a message asks to find, or asks whether there is, a clinic, pharmacy or nearby facility, or names a suburb and asks if MyThuso reaches it. Every answer says plainly that it is coverage information, not a facility listing.",
    schema: z.object({
      area: z
        .string()
        .describe("The suburb, area or place named in the message, e.g. 'Melville' or 'clinic near Soweto'"),
    }),
  },
);
