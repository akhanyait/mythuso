import test from "node:test";
import assert from "node:assert/strict";
import { checkDrugInteraction } from "./drug-check.ts";

/* The drug-check tool's own tests, added with the OpenFDA backing work. The local 30-pair floor
   is exercised by tools.test.ts; these tests focus on the dual-source behaviour: local precedence,
   OpenFDA supplementation, silent failure, and the invariant that "no record" is never "safe".

   Every test that exercises the OpenFDA path sets OPENFDA_ENABLED and stubs globalThis.fetch —
   the same pattern tools.test.ts uses for literature-search — and restores both in a finally,
   so a failure here can never leak a stub or an env var into a test that runs after it. */

/* ── Helpers ─────────────────────────────────────────────────────────────────────────────────── */

const stubFetch = (impl: typeof fetch): (() => void) => {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return () => {
    globalThis.fetch = original;
  };
};

const withOpenFdaEnabled = (body: () => Promise<void>): (() => Promise<void>) => {
  return async () => {
    const saved = process.env.OPENFDA_ENABLED;
    process.env.OPENFDA_ENABLED = "true";
    try {
      await body();
    } finally {
      if (saved === undefined) delete process.env.OPENFDA_ENABLED;
      else process.env.OPENFDA_ENABLED = saved;
    }
  };
};

/* A minimal openFDA drug-label response: the label of `generic`, whose drug_interactions section is
   `section`. The shape is the published drug/label record's (open.fda.gov/apis/drug/label). */
const openFdaLabelBody = (generic: string, section: string, id = "label-1"): string =>
  JSON.stringify({
    results: [{ id, openfda: { generic_name: [generic] }, drug_interactions: [section] }],
  });

/* ── Local floor: unchanged behaviour ────────────────────────────────────────────────────────── */

test("drug-check: local pair fires first — warfarin + aspirin", async () => {
  /* warfarin + aspirin is in the local 30-pair list. Even with OpenFDA enabled, the local
     result must be returned without calling the external API. */
  let fetchCalled = false;
  const restore = stubFetch((async () => {
    fetchCalled = true;
    throw new Error("should not be called");
  }) as unknown as typeof fetch);
  const saved = process.env.OPENFDA_ENABLED;
  process.env.OPENFDA_ENABLED = "true";
  try {
    const output = await checkDrugInteraction("warfarin", "aspirin");
    assert.ok(output.includes("severity: HIGH"), "local severity is returned");
    assert.ok(output.includes("Increased bleeding risk"), "local effect text is returned");
    assert.ok(output.includes("Avoid the combination"), "local recommendation is returned");
    assert.equal(fetchCalled, false, "OpenFDA must not be called when local data matches");
    assert.ok(
      !output.includes("openFDA"),
      "Sources line must not mention OpenFDA when only local data contributed",
    );
  } finally {
    if (saved === undefined) delete process.env.OPENFDA_ENABLED;
    else process.env.OPENFDA_ENABLED = saved;
    restore();
  }
});

test("drug-check: SA alias still resolves — panado → paracetamol", async () => {
  /* panado is an SA shelf name for paracetamol. The same-drug guard must fire when both
     names resolve to the same generic. */
  const output = await checkDrugInteraction("panado", "paracetamol");
  assert.ok(output.includes("the same medicine"), "panado and paracetamol are one medicine");
  assert.ok(output.includes("ask a pharmacist or your nurse"), "hands the decision back");
  assert.ok(output.includes("Sources: MyThuso interaction list"), "Sources line is present");
});

test("drug-check: same-drug guard still works for non-aliased names", async () => {
  const output = await checkDrugInteraction("aspirin", "aspirin");
  assert.ok(output.includes("the same medicine"));
  assert.ok(output.includes("ask a pharmacist or your nurse"));
});

test('drug-check: "no record" never says "safe" — both sources empty', async () => {
  /* paracetamol + loratadine is not in the local 30-pair list. With OpenFDA disabled
     (the default), the tool must return the honest "no record" answer that never
     implies safety. */
  const output = await checkDrugInteraction("paracetamol", "loratadine");
  assert.ok(output.includes("No known interaction is recorded"));
  assert.ok(
    output.includes("That is not the same as safe to combine"),
    "the invariant: no record is never safe",
  );
  assert.ok(output.includes("Sources:"), "every answer carries its sources");
  assert.equal(
    output.toLowerCase().includes("safe to take"),
    false,
    'the word "safe" must never appear as an assurance',
  );
});

/* ── OpenFDA supplementation ─────────────────────────────────────────────────────────────────── */

test(
  "drug-check: OpenFDA supplements when local has no data — from the label's interactions section",
  withOpenFdaEnabled(async () => {
    /* paracetamol + loratadine is not in the local list. With openFDA enabled and a stubbed label,
       the tool quotes the label's own interactions sentence, attributed, ungraded and never as
       guidance. */
    const urls: string[] = [];
    const restore = stubFetch((async (input: string | URL | Request) => {
      urls.push(String(input));
      return new Response(
        openFdaLabelBody(
          "ACETAMINOPHEN",
          "7 DRUG INTERACTIONS Loratadine may increase the plasma concentration of this medicine. Use the lowest dose of loratadine for the shortest time.",
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch);
    try {
      const output = await checkDrugInteraction("paracetamol", "loratadine");
      assert.equal(urls.length, 1, "one request answers when the first direction finds the label");
      assert.ok(urls[0].startsWith("https://api.fda.gov/drug/label.json?"), "asks openFDA's published label index");
      assert.ok(output.includes("labelled interaction"), "presented as what a label says");
      assert.ok(output.includes("ACETAMINOPHEN"), "the label's own generic name is carried");
      assert.ok(output.includes("may increase the plasma concentration"), "the label's own interaction sentence is quoted");
      assert.equal(output.includes("lowest dose"), false, "a dosing sentence is never relayed");
      assert.ok(output.includes("severity: NOT GRADED (US LABEL)"), "the label grades nothing, and the answer invents no grade");
      assert.ok(output.includes("not South African guidance"), "US wording never stands as SA guidance");
      assert.ok(output.includes("Sources: openFDA drug label"), "attributed to openFDA");
    } finally {
      restore();
    }
  }),
);

test(
  "drug-check: Sources line includes openfda when it contributes",
  withOpenFdaEnabled(async () => {
    const restore = stubFetch(
      (async () =>
        new Response(openFdaLabelBody("DRUGX", "Druggy may cause a rash when taken with this medicine."), {
          status: 200,
          headers: { "content-type": "application/json" },
        })) as unknown as typeof fetch,
    );
    try {
      /* Use a pair not in the local list so openFDA is the only contributor. */
      const output = await checkDrugInteraction("drugx", "druggy");
      assert.ok(
        output.includes("Sources: openFDA drug label, US Food and Drug Administration (api.fda.gov/drug/label.json)"),
        "the Sources line names openFDA's label index when it contributed results",
      );
    } finally {
      restore();
    }
  }),
);

test(
  "drug-check: OpenFDA failure is silent — network error falls back to local-only",
  withOpenFdaEnabled(async () => {
    /* A network error must not throw, must not block, and must not change the answer:
       the tool returns the same "no record" answer it would with OpenFDA disabled. */
    const restore = stubFetch(
      (async () => {
        throw new Error("simulated network failure");
      }) as unknown as typeof fetch,
    );
    try {
      const output = await checkDrugInteraction("paracetamol", "loratadine");
      assert.ok(output.includes("No known interaction is recorded"));
      assert.ok(output.includes("That is not the same as safe to combine"));
      assert.ok(output.includes("Sources: MyThuso interaction list"));
      assert.equal(
        output.toLowerCase().includes("openfda"),
        false,
        "a failed OpenFDA call must not appear in the Sources line",
      );
    } finally {
      restore();
    }
  }),
);

test(
  "drug-check: OpenFDA timeout is silent — AbortSignal.timeout falls back to local-only",
  withOpenFdaEnabled(async () => {
    /* A timeout (AbortSignal.timeout fires) must degrade exactly like a network error. */
    const restore = stubFetch(
      (async () => {
        const error = new Error("The operation was aborted");
        error.name = "TimeoutError";
        throw error;
      }) as unknown as typeof fetch,
    );
    try {
      const output = await checkDrugInteraction("paracetamol", "loratadine");
      assert.ok(output.includes("No known interaction is recorded"));
      assert.ok(output.includes("That is not the same as safe to combine"));
    } finally {
      restore();
    }
  }),
);

test(
  "drug-check: OpenFDA non-200 response is silent",
  withOpenFdaEnabled(async () => {
    /* A 404, 429 or 503 from OpenFDA must degrade to the local-only answer. */
    const restore = stubFetch(
      (async () => new Response("", { status: 404 })) as unknown as typeof fetch,
    );
    try {
      const output = await checkDrugInteraction("paracetamol", "loratadine");
      assert.ok(output.includes("No known interaction is recorded"));
      assert.ok(output.includes("That is not the same as safe to combine"));
    } finally {
      restore();
    }
  }),
);

test(
  "drug-check: OpenFDA empty results array is honest — no record, never safe",
  withOpenFdaEnabled(async () => {
    /* OpenFDA answers 200 but with zero results: the tool must say "no record",
       not invent an interaction and not imply safety. */
    const restore = stubFetch(
      (async () =>
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })) as unknown as typeof fetch,
    );
    try {
      const output = await checkDrugInteraction("paracetamol", "loratadine");
      assert.ok(output.includes("No known interaction is recorded"));
      assert.ok(output.includes("That is not the same as safe to combine"));
      assert.ok(output.includes("Sources: MyThuso interaction list"));
    } finally {
      restore();
    }
  }),
);

test(
  "drug-check: OpenFDA disabled by default — no env var means no external call",
  async () => {
    /* The default deployment has OPENFDA_ENABLED unset. The tool must not call
       fetch at all for a pair the local list does not carry. */
    const saved = process.env.OPENFDA_ENABLED;
    delete process.env.OPENFDA_ENABLED;
    let fetchCalled = false;
    const restore = stubFetch((async () => {
      fetchCalled = true;
      throw new Error("should not be called");
    }) as unknown as typeof fetch);
    try {
      const output = await checkDrugInteraction("paracetamol", "loratadine");
      assert.equal(fetchCalled, false, "no external call when OPENFDA_ENABLED is unset");
      assert.ok(output.includes("No known interaction is recorded"));
      assert.ok(output.includes("Sources: MyThuso interaction list"));
    } finally {
      if (saved === undefined) delete process.env.OPENFDA_ENABLED;
      else process.env.OPENFDA_ENABLED = saved;
      restore();
    }
  },
);

test(
  "drug-check: malformed OpenFDA JSON is silent",
  withOpenFdaEnabled(async () => {
    /* A response that is not valid JSON must not throw — the parse error is caught
       and the tool degrades to its local-only answer. */
    const restore = stubFetch(
      (async () =>
        new Response("this is not json", {
          status: 200,
          headers: { "content-type": "application/json" },
        })) as unknown as typeof fetch,
    );
    try {
      const output = await checkDrugInteraction("paracetamol", "loratadine");
      assert.ok(output.includes("No known interaction is recorded"));
      assert.ok(output.includes("That is not the same as safe to combine"));
    } finally {
      restore();
    }
  }),
);
