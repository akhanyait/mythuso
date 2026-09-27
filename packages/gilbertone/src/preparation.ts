import contract from "../../catalog/visit-preparation.json" with { type: "json" };
import services from "../../catalog/services.json" with { type: "json" };

/* The pre-visit companion — what to have ready for the visit that is booked, read from
   packages/catalog/visit-preparation.json for the service in packages/catalog/services.json.

   Nothing here is composed. The list is the contract's for that service, the three common items
   first; the sentence beside it says whether a clinician has reviewed the list, and today none has,
   so every list reads the unreviewed sentence. The build refuses an unreviewed list that carries a
   clinical instruction — hours, doses, a medicine to take or stop, a meal to skip — which is the
   reason this module can read a list aloud without knowing what is in it. With nothing booked the
   answer says so and nothing else: no service is guessed at, because a list for the wrong visit is
   advice about a visit that does not exist. No network, no model, no environment variable. */

type Prepared = (typeof contract.services)[keyof typeof contract.services];

export type PreparationAnswer =
  | {
      kind: "list";
      serviceId: string;
      serviceName: string;
      lead: string;
      items: string[];
      /* The reviewed sentence with the registration in it, or the unreviewed one. */
      review: string;
      reviewedBy: string | null;
      neverInstructs: string;
    }
  | { kind: "none"; sentence: string };

const fill = (sentence: string, values: Record<string, string>) =>
  sentence.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);

export function preparationFor(serviceId: string | null): PreparationAnswer {
  if (serviceId === null)
    return { kind: "none", sentence: contract.answer.nothingBooked };
  const service = services.find((s) => s.id === serviceId);
  const prepared = (contract.services as Record<string, Prepared>)[serviceId];
  /* Loud rather than blank: a service the catalogue sells with no list here is the drift the
     boundary check refuses, and a screen that quietly read nothing would hide it. */
  if (!service || !prepared)
    throw new Error(
      `packages/catalog/visit-preparation.json has no list for the service "${serviceId}" in packages/catalog/services.json. Every service the catalogue sells has one, or the visit has nothing to say before it.`,
    );
  const reviewedBy = prepared.reviewedBy as string | null;
  return {
    kind: "list",
    serviceId,
    serviceName: service.name,
    lead: fill(contract.answer.lead, { service: service.name }),
    items: [...contract.common, ...prepared.items],
    review:
      reviewedBy === null
        ? contract.answer.unreviewed
        : fill(contract.answer.reviewed, { reviewedBy }),
    reviewedBy,
    neverInstructs: contract.answer.neverInstructs,
  };
}

export const preparationContract = contract;
