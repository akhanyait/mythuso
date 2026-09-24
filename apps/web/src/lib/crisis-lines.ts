import contract from "../../../../packages/catalog/crisis-lines.json";

/* The crisis lines GilbertOne's emergency answer adds when a message carried words about harming
   yourself — packages/catalog/crisis-lines.json, read here rather than typed, because the numbers
   already live in packages/catalog/knowledge/mental-health.json and the build fails if the two
   disagree.

   The one decision this file makes is whether the lines belong in an answer, and it is the
   contract's: the message matched the group `showsWhen` names, and nothing else. A chest pain gets
   the emergency answer as it always was. The lines are added after the ambulance numbers by every
   screen that shows them and never instead of them — a person in a crisis who is also in danger
   needs the ambulance first, and a list that led with a counselling line would be asking her to
   choose. */
export const crisisLines = contract;

export const showsCrisisLines = (groups: { id: string }[]) =>
  groups.some((g) => g.id === contract.showsWhen.group);
