/**
 * The derived half of the clinical views.
 *
 * build-data.mjs snapshots the clinical contracts into data.js as `window.KIT.clinicalSnapshot`.
 * Nothing clinical is typed by hand in this file, and nothing here invents a reading, a
 * reference range, a diagnosis or a triage outcome. What this file does is derive — the counts,
 * the arithmetic, the states, the refusals, the copy that a screen renders — from that snapshot,
 * and hold the handful of decisions about *what is shown* that are this kit's rather than the
 * contracts'.
 *
 * Those decisions, each with the reason it was taken:
 *
 *  - The snapshot carries `governance` and `board`, which are read from
 *    `packages/catalog/governance-status.json`. That file names its readers, and `build-data.mjs`
 *    is deliberately not one of them — the same reason `province-data.js` reads the service
 *    boundary files directly rather than through the snapshot. So those two are read here.
 *  - The snapshot carries `identity`, read from `packages/catalog/identity.json`, because the
 *    kit's own rule is that no screen carries a real person's name. Every person in these views
 *    is therefore a role: "the doctor on review", "the second reviewer", "the pharmacist who
 *    checked the substitution". `identity.json` holds the sentence that says so.
 *  - No patient is named anywhere in these views. `records.json` is not snapshot at all: a
 *    visit belongs to a person, and the moment a visit carries a name the kit has invented a
 *    patient. The nurse's queue is therefore a queue of *visits* — an id, a kind, a window, a
 *    distance — and the moment one is opened, it is opened as a refusal or as a frame with the
 *    record deliberately left out. That is also the truest state of this product: the visit
 *    record cannot be opened because the clinical service is not built.
 *  - `roster.json` is snapshot only for the shape of a shift and the reasons a shift is refused.
 *    The kit shows no nurse roster of its own: `province.js` already draws the real one, from the
 *    real service, and a second invented roster would be exactly the drift the boundaries forbid.
 */

(function (global) {
  "use strict";

  var snapshot = (global.KIT && global.KIT.clinicalSnapshot) || null;
  var catalog = snapshot && snapshot.catalog ? snapshot.catalog : {};

  var care = catalog.care || {};
  var capture = catalog.capture || {};
  var vetting = catalog.vetting || {};
  var clinical = catalog.clinical || {};
  var protocols = catalog.protocols || {};
  var dispensing = catalog.dispensing || {};
  var medicines = catalog.medicines || {};
  var capabilities = catalog.capabilities || {};
  var records = catalog.records || {};
  var roster = catalog.roster || {};
  var events = catalog.events || {};
  var identity = catalog.identity || {};

  var governance = snapshot && snapshot.governance ? snapshot.governance : null;
  var board = snapshot && snapshot.board ? snapshot.board : null;

  /** How many items, or how many bytes, as a sentence the kit can render without arithmetic on screen. */
  function count(n) {
    if (n === 0) return "none";
    if (n === 1) return "one";
    return String(n);
  }

  /** The contracts call a refusal "the valuable part". Look one up by id, across every list that holds them. */
  function refusal(list, id) {
    if (!list || !list.length) return null;
    for (var i = 0; i < list.length; i += 1) if (list[i] && list[i].id === id) return list[i];
    return null;
  }

  function refusalText(list, id, fallback) {
    var found = refusal(list, id);
    return found && found.sentence ? found.sentence : fallback || (id + " — the contract holds no sentence for this refusal");
  }

  function rule(rules, id) {
    if (!rules || !rules.length) return null;
    for (var i = 0; i < rules.length; i += 1) if (rules[i] && rules[i].id === id) return rules[i];
    return null;
  }

  /** Every refusal in the snapshot, so a screen can show the shape of the whole refusal set rather than one at a time. */
  function allRefusals() {
    var out = [];
    function push(source, list) {
      if (!list || !list.length) return;
      for (var i = 0; i < list.length; i += 1) {
        var item = list[i];
        if (!item) continue;
        out.push({
          source: source,
          id: item.id,
          sentence: item.sentence || "",
          detail: item.detail || "",
          action: item.action || "",
          when: item.when || ""
        });
      }
    }
    push("care", care.refusals);
    push("capture", capture.refusals);
    push("vetting", vetting.refusals);
    push("clinical", clinical.refusals);
    push("protocols", protocols.refusals);
    push("dispensing", dispensing.refusals);
    push("medicines", medicines.refusals);
    push("records", records.refusals);
    push("roster", roster.refusals);
    push("events", events.refusals);
    return out;
  }

  function refusalsBySource() {
    var out = {};
    var all = allRefusals();
    for (var i = 0; i < all.length; i += 1) {
      if (!out[all[i].source]) out[all[i].source] = [];
      out[all[i].source].push(all[i]);
    }
    return out;
  }

  /**
   * Every capability whose contract says it is connected to a real backend. In this repository
   * that list is empty, and a clinical view that showed a connected service would be lying.
   * Kept as a derived value rather than a typed "none" so the screen can prove it looked.
   */
  function connectedCapabilities() {
    var list = capabilities.capabilities || [];
    var out = [];
    for (var i = 0; i < list.length; i += 1) {
      if (list[i] && list[i].connected === true) out.push(list[i].id || list[i].name);
    }
    return out;
  }

  function capabilitiesById() {
    var out = {};
    var list = capabilities.capabilities || [];
    for (var i = 0; i < list.length; i += 1) if (list[i] && list[i].id) out[list[i].id] = list[i];
    return out;
  }

  /** The clinical capability group, and what the contract says each of its members is connected to. */
  function clinicalCapabilities() {
    var groups = capabilities.capabilityGroups || capabilities.groups || [];
    var byId = capabilitiesById();
    var group = null;
    for (var i = 0; i < groups.length; i += 1) {
      if (groups[i] && groups[i].id === "clinical") { group = groups[i]; break; }
    }
    var ids = group && group.capabilityIds ? group.capabilityIds : [];
    var rows = [];
    for (var j = 0; j < ids.length; j += 1) {
      var cap = byId[ids[j]];
      if (!cap) continue;
      rows.push({
        id: cap.id,
        name: cap.name || cap.id,
        connected: cap.connected === true,
        backend: cap.backend === null || cap.backend === undefined ? "none" : String(cap.backend),
        notConnected: cap.notConnected || "",
        detail: cap.detail || ""
      });
    }
    return { group: group, rows: rows };
  }

  /* ------------------------------------------------------------------ *
   * Ratification — the state every clinical screen in this repository
   * carries, because none of it may imply a working clinical product.
   * ------------------------------------------------------------------ */

  function governanceRows() {
    if (!governance) return [];
    var rows = [];
    var order = ["medical-director", "governance-board"];
    for (var i = 0; i < order.length; i += 1) {
      var entry = governance[order[i]];
      if (!entry) continue;
      rows.push({
        id: order[i],
        label: entry.label,
        status: entry.status,
        holder: entry.holder,
        detail: entry.detail,
        document: entry.document,
        requiredFor: entry.requiredFor || []
      });
    }
    return rows;
  }

  function ratifiedProtocols() {
    var list = protocols.protocols || [];
    var out = [];
    for (var i = 0; i < list.length; i += 1) {
      if (list[i] && list[i].status === "ratified") out.push(list[i]);
    }
    return out;
  }

  /** The ratification refusal, which the triage screen renders word for word because the contract wrote it. */
  function triageRefusal() {
    return refusal(clinical.refusals, "triage-without-ratified-protocol");
  }

  function ratification() {
    var md = governance ? governance["medical-director"] : null;
    var gb = governance ? governance["governance-board"] : null;
    var list = protocols.protocols || [];
    var drafts = 0;
    for (var i = 0; i < list.length; i += 1) if (list[i] && list[i].status === "draft") drafts += 1;
    var rat = triageRefusal();
    return {
      medicalDirector: md ? { status: md.status, holder: md.holder, label: md.label, detail: md.detail, document: md.document } : null,
      board: gb ? { status: gb.status, holder: gb.holder, label: gb.label, detail: gb.detail, document: gb.document } : null,
      protocols: { count: list.length, draft: drafts, ratified: list.length - drafts },
      refusal: rat ? { id: rat.id, sentence: rat.sentence, detail: rat.detail, action: rat.action } : null,
      identity: { sentence: identity.sentence || "", rule: identity.rule || "" }
    };
  }

  /* ------------------------------------------------------------------ *
   * CareVisit — the nurse's visit.
   * ------------------------------------------------------------------ */

  function visitKinds() {
    var kinds = care.visitKinds || [];
    var byId = {};
    var rows = [];
    for (var i = 0; i < kinds.length; i += 1) {
      var k = kinds[i];
      if (!k) continue;
      byId[k.id] = k;
      rows.push({
        id: k.id,
        label: k.label,
        who: k.who,
        detail: k.detail,
        durationMinutes: k.durationMinutes,
        price: k.price,
        nurseShare: k.nurseShare,
        platformFee: k.platformFee,
        cancellationFee: k.cancellationFee,
        cancellationWaiverHours: k.cancellationWaiverHours,
        arrivalWindowMinutes: k.arrivalWindowMinutes,
        distanceKm: k.distanceKm,
        includes: k.includes || [],
        notIncluded: k.notIncluded || "",
        steps: k.steps || []
      });
    }
    return { rows: rows, byId: byId };
  }

  /**
   * The visit's own steps, as the contract wrote them. This is the workflow the nurse follows and
   * it is not invented here: `care.json` holds a step list for each visit kind, and the concept
   * view renders it as a rail. Where the contract holds no step, the rail shows that.
   */
  function visitSteps(kindId) {
    var kinds = visitKinds().byId;
    var kind = kinds[kindId];
    if (!kind) return [];
    var steps = kind.steps || [];
    return steps.map(function (step, index) {
      return {
        index: index,
        id: step.id || String(index),
        label: step.label || step.id || "",
        detail: step.detail || "",
        requires: step.requires || [],
        optional: step.optional === true
      };
    });
  }

  function visitStates() {
    return (care.visitStates || []).map(function (s) {
      return { id: s.id, label: s.label, detail: s.detail || "", tone: s.tone || "neutral" };
    });
  }

  function careRules() {
    return (care.rules || []).map(function (r) {
      return { id: r.id, statement: r.statement || r.detail || "", detail: r.detail || "", enforcedBy: r.enforcedBy || "" };
    });
  }

  function careRefusals() {
    return (care.refusals || []).map(function (r) {
      return { id: r.id, sentence: r.sentence || "", detail: r.detail || "", action: r.action || "" };
    });
  }

  /* ------------------------------------------------------------------ *
   * Thuso Kit — capture, readings, offline, conflicts.
   * ------------------------------------------------------------------ */

  function captureStates() {
    return (capture.captureStates || capture.states || []).map(function (s) {
      return { id: s.id, label: s.label, detail: s.detail || "", tone: s.tone || "neutral" };
    });
  }

  function captureConflicts() {
    return (capture.conflicts || []).map(function (c) {
      return {
        id: c.id,
        label: c.label,
        detail: c.detail || "",
        resolution: c.resolution || "",
        resolvedBy: c.resolvedBy || "",
        refuses: c.refuses || ""
      };
    });
  }

  function captureRefusals() {
    return (capture.refusals || []).map(function (r) {
      return { id: r.id, sentence: r.sentence || "", detail: r.detail || "", action: r.action || "" };
    });
  }

  /**
   * What the Kit can carry. `capture.json` names the observation kinds and their provenance; the
   * concept view shows the kinds and refuses to show a value for any of them, because a value
   * would be an invented reading and there is no service behind the device.
   */
  function captureKinds() {
    var kinds = capture.observationKinds || capture.kinds || capture.readings || [];
    return kinds.map(function (k) {
      return {
        id: k.id,
        label: k.label || k.id,
        unit: k.unit || "",
        device: k.device || "",
        provenance: k.provenance || "",
        range: k.referenceRange || k.range || null,
        detail: k.detail || ""
      };
    });
  }

  function captureRules() {
    return (capture.rules || []).map(function (r) {
      return { id: r.id, statement: r.statement || r.detail || "", detail: r.detail || "", enforcedBy: r.enforcedBy || "" };
    });
  }

  /* ------------------------------------------------------------------ *
   * Vetting — the credential register and its gates.
   * ------------------------------------------------------------------ */

  function vettingRoles() {
    return (vetting.roles || []).map(function (r) {
      return {
        id: r.id,
        label: r.label || r.id,
        detail: r.detail || "",
        registrationBody: r.registrationBody || "",
        highRisk: r.highRisk === true,
        capabilities: r.capabilities || [],
        gates: r.gates || []
      };
    });
  }

  function vettingGates() {
    return (vetting.gates || []).map(function (g) {
      return {
        id: g.id,
        label: g.label || g.id,
        detail: g.detail || "",
        reviewers: g.reviewers || g.reviewersRequired || 0,
        highRisk: g.highRisk === true,
        lapsesAfterDays: g.lapsesAfterDays || g.validForDays || null,
        withdraws: g.withdraws || ""
      };
    });
  }

  function vettingChecks() {
    return (vetting.checks || []).map(function (c) {
      return {
        id: c.id,
        label: c.label || c.id,
        detail: c.detail || "",
        reviewers: c.reviewers || c.reviewersRequired || 0,
        highRisk: c.highRisk === true,
        source: c.source || ""
      };
    });
  }

  function vettingAuthorities() {
    return (vetting.authorities || []).map(function (a) {
      return { id: a.id, label: a.label || a.id, detail: a.detail || "", scope: a.scope || "" };
    });
  }

  function vettingCapabilities() {
    return (vetting.capabilities || []).map(function (c) {
      return { id: c.id, label: c.label || c.id, detail: c.detail || "", requires: c.requires || [] };
    });
  }

  function vettingStates() {
    return (vetting.states || vetting.standings || []).map(function (s) {
      return { id: s.id, label: s.label || s.id, detail: s.detail || "", tone: s.tone || "neutral" };
    });
  }

  function vettingRefusals() {
    return (vetting.refusals || []).map(function (r) {
      return { id: r.id, sentence: r.sentence || "", detail: r.detail || "", action: r.action || "" };
    });
  }

  function vettingRules() {
    return (vetting.rules || []).map(function (r) {
      return { id: r.id, statement: r.statement || r.detail || "", detail: r.detail || "", enforcedBy: r.enforcedBy || "" };
    });
  }

  /** The two-reviewer rule, which is the reason a vetting register exists at all. */
  function twoReviewerChecks() {
    var checks = vettingChecks();
    var out = [];
    for (var i = 0; i < checks.length; i += 1) if (checks[i].reviewers >= 2) out.push(checks[i]);
    return out;
  }

  /**
   * The lapse arithmetic. `vetting.json` states it as a rule: a credential that has passed its
   * date withdraws the capability by arithmetic, not by somebody remembering. No timer runs in
   * the kit — the kit shows the rule and the day count it is computed from, and nothing else.
   */
  function lapseRules() {
    var rules = vettingRules();
    var out = [];
    for (var i = 0; i < rules.length; i += 1) {
      var id = rules[i].id || "";
      if (/lapse|expiry|withdraw|renew/i.test(id)) out.push(rules[i]);
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * ClinicalIntelligence — the doctor's inbox, the consultation frame, triage.
   * ------------------------------------------------------------------ */

  function inboxStates() {
    return (clinical.inboxStates || clinical.states || []).map(function (s) {
      return { id: s.id, label: s.label || s.id, detail: s.detail || "", tone: s.tone || "neutral" };
    });
  }

  function consultationFrames() {
    return (clinical.consultationFrames || clinical.frames || []).map(function (f) {
      return {
        id: f.id,
        label: f.label || f.id,
        detail: f.detail || "",
        sections: (f.sections || []).map(function (s) {
          return { id: s.id, label: s.label || s.id, detail: s.detail || "", prompt: s.prompt || "" };
        })
      };
    });
  }

  function triageTiers() {
    return (clinical.triageTiers || clinical.tiers || []).map(function (t) {
      return { id: t.id, label: t.label || t.id, detail: t.detail || "", response: t.response || "", tone: t.tone || "neutral" };
    });
  }

  function promQuestions() {
    return (clinical.promQuestions || clinical.proms || []).map(function (q) {
      return { id: q.id, label: q.label || q.question || q.id, detail: q.detail || "", schedule: q.schedule || "", domain: q.domain || "" };
    });
  }

  function clinicalRefusals() {
    return (clinical.refusals || []).map(function (r) {
      return { id: r.id, sentence: r.sentence || "", detail: r.detail || "", action: r.action || "" };
    });
  }

  function clinicalRules() {
    return (clinical.rules || []).map(function (r) {
      return { id: r.id, statement: r.statement || r.detail || "", detail: r.detail || "", enforcedBy: r.enforcedBy || "" };
    });
  }

  function protocolRows() {
    return (protocols.protocols || []).map(function (p) {
      return {
        id: p.id,
        label: p.label || p.title || p.id,
        status: p.status || "draft",
        version: p.version || "",
        scope: p.scope || "",
        detail: p.detail || "",
        ratifiedBy: p.ratifiedBy || null,
        ratificationDate: p.ratificationDate || null,
        reviewer: p.reviewer || null
      };
    });
  }

  /* ------------------------------------------------------------------ *
   * The doctor's clinical set — workbench, dispensing, orders.
   * ------------------------------------------------------------------ */

  function workbenchQueues() {
    return (clinical.workbenchQueues || clinical.queues || []).map(function (q) {
      return { id: q.id, label: q.label || q.id, detail: q.detail || "", tone: q.tone || "neutral" };
    });
  }

  function substitutionClasses() {
    return (dispensing.substitutionClasses || dispensing.substitution || []).map(function (s) {
      return {
        id: s.id,
        label: s.label || s.id,
        detail: s.detail || "",
        maySubstitute: s.maySubstitute === true,
        tone: s.tone || "neutral",
        section: s.section || "Section 22F"
      };
    });
  }

  function dispensingRefusals() {
    return (dispensing.refusals || []).map(function (r) {
      return { id: r.id, sentence: r.sentence || "", detail: r.detail || "", action: r.action || "" };
    });
  }

  function dispensingRules() {
    return (dispensing.rules || []).map(function (r) {
      return { id: r.id, statement: r.statement || r.detail || "", detail: r.detail || "", enforcedBy: r.enforcedBy || "" };
    });
  }

  function dispensingStates() {
    return (dispensing.states || dispensing.orderStates || []).map(function (s) {
      return { id: s.id, label: s.label || s.id, detail: s.detail || "", tone: s.tone || "neutral" };
    });
  }

  /**
   * The order's accreditation gate. `dispensing.json` states which order kinds a lab may only
   * accept from an accredited practice; the concept view shows the gate and the refusal, and
   * shows no order, because there is no accredited practice and no service to send one to.
   */
  function accreditationGates() {
    return (dispensing.accreditationGates || dispensing.accreditation || []).map(function (g) {
      return { id: g.id, label: g.label || g.id, detail: g.detail || "", requires: g.requires || "", refuses: g.refuses || "" };
    });
  }

  function medicineClasses() {
    return (medicines.classes || medicines.medicineClasses || []).map(function (c) {
      return { id: c.id, label: c.label || c.id, detail: c.detail || "", schedule: c.schedule || "" };
    });
  }

  function medicinesRefusals() {
    return (medicines.refusals || []).map(function (r) {
      return { id: r.id, sentence: r.sentence || "", detail: r.detail || "", action: r.action || "" };
    });
  }

  /* ------------------------------------------------------------------ *
   * Counts. Every number these views show is derived here, so a screen
   * never does arithmetic of its own and two screens cannot disagree.
   * ------------------------------------------------------------------ */

  function counts() {
    var roles = vettingRoles();
    var gates = vettingGates();
    var checks = vettingChecks();
    var auths = vettingAuthorities();
    var caps = vettingCapabilities();
    var kinds = visitKinds().rows;
    var prots = protocolRows();
    var conflicts = captureConflicts();
    var states = captureStates();
    return {
      visitKinds: kinds.length,
      visitSteps: kinds.reduce(function (sum, k) { return sum + (k.steps ? k.steps.length : 0); }, 0),
      captureStates: states.length,
      captureConflicts: conflicts.length,
      captureKinds: captureKinds().length,
      vettingRoles: roles.length,
      vettingCapabilities: caps.length,
      vettingAuthorities: auths.length,
      vettingGates: gates.length,
      vettingChecks: checks.length,
      twoReviewerChecks: twoReviewerChecks().length,
      highRiskRoles: roles.filter(function (r) { return r.highRisk; }).length,
      protocols: prots.length,
      draftProtocols: prots.filter(function (p) { return p.status === "draft"; }).length,
      ratifiedProtocols: prots.filter(function (p) { return p.status === "ratified"; }).length,
      clinicalRefusals: (clinical.refusals || []).length,
      dispensingRefusals: (dispensing.refusals || []).length,
      substitutionClasses: substitutionClasses().length,
      connectedCapabilities: connectedCapabilities().length,
      totalRefusals: allRefusals().length
    };
  }

  /** The shape of a shift, from `roster.json` — shown as a shape, never as a named nurse's day. */
  function shiftShape() {
    var shifts = roster.shifts || roster.shiftKinds || [];
    var first = shifts.length ? shifts[0] : null;
    return {
      kinds: shifts.map(function (s) { return { id: s.id, label: s.label || s.id, detail: s.detail || "" }; }),
      refusals: (roster.refusals || []).map(function (r) { return { id: r.id, sentence: r.sentence || "", detail: r.detail || "" }; }),
      example: first ? { id: first.id, label: first.label || first.id } : null
    };
  }

  /** The record contract's own account of what a clinical record is and who may open it. */
  function recordContract() {
    return {
      states: (records.states || records.recordStates || []).map(function (s) {
        return { id: s.id, label: s.label || s.id, detail: s.detail || "", tone: s.tone || "neutral" };
      }),
      kinds: (records.kinds || records.recordKinds || []).map(function (k) {
        return { id: k.id, label: k.label || k.id, detail: k.detail || "" };
      }),
      refusals: (records.refusals || []).map(function (r) {
        return { id: r.id, sentence: r.sentence || "", detail: r.detail || "", action: r.action || "" };
      }),
      rules: (records.rules || []).map(function (r) {
        return { id: r.id, statement: r.statement || r.detail || "", detail: r.detail || "" };
      })
    };
  }

  /** The events these screens would emit, named so a reviewer can see the seam between them. */
  function clinicalEvents() {
    var list = events.events || [];
    var wanted = /visit|capture|vetting|clinical|triage|consult|dispens|order|protocol/i;
    var out = [];
    for (var i = 0; i < list.length; i += 1) {
      var e = list[i];
      if (!e) continue;
      var id = e.id || e.type || "";
      if (!wanted.test(id)) continue;
      out.push({ id: id, version: e.version || "", detail: e.detail || "", emits: e.emits || "", withdrawn: e.withdrawn === true });
    }
    return out;
  }

  global.KIT_CLINICAL = {
    available: Boolean(snapshot),
    snapshot: snapshot,
    catalog: catalog,
    counts: counts(),
    ratification: ratification(),
    governanceRows: governanceRows(),
    board: board,
    identity: identity,
    connectedCapabilities: connectedCapabilities(),
    clinicalCapabilities: clinicalCapabilities(),
    refusalsBySource: refusalsBySource(),
    allRefusals: allRefusals(),
    refusalText: refusalText,
    rule: rule,
    count: count,
    /* care */
    visitKinds: visitKinds(),
    visitSteps: visitSteps,
    visitStates: visitStates(),
    careRules: careRules(),
    careRefusals: careRefusals(),
    /* kit */
    captureStates: captureStates(),
    captureConflicts: captureConflicts(),
    captureRefusals: captureRefusals(),
    captureKinds: captureKinds(),
    captureRules: captureRules(),
    /* vetting */
    vettingRoles: vettingRoles(),
    vettingGates: vettingGates(),
    vettingChecks: vettingChecks(),
    vettingAuthorities: vettingAuthorities(),
    vettingCapabilities: vettingCapabilities(),
    vettingStates: vettingStates(),
    vettingRefusals: vettingRefusals(),
    vettingRules: vettingRules(),
    twoReviewerChecks: twoReviewerChecks(),
    lapseRules: lapseRules(),
    /* intelligence */
    inboxStates: inboxStates(),
    consultationFrames: consultationFrames(),
    triageTiers: triageTiers(),
    promQuestions: promQuestions(),
    clinicalRefusals: clinicalRefusals(),
    clinicalRules: clinicalRules(),
    protocolRows: protocolRows(),
    /* workbench, dispensing, orders */
    workbenchQueues: workbenchQueues(),
    substitutionClasses: substitutionClasses(),
    dispensingRefusals: dispensingRefusals(),
    dispensingRules: dispensingRules(),
    dispensingStates: dispensingStates(),
    accreditationGates: accreditationGates(),
    medicineClasses: medicineClasses(),
    medicinesRefusals: medicinesRefusals(),
    /* the rest */
    shiftShape: shiftShape(),
    recordContract: recordContract(),
    clinicalEvents: clinicalEvents()
  };
})(typeof window !== "undefined" ? window : globalThis);
