/* How a person's name is shortened, in one place.
 *
 * "Sister Naledi Mokoena" initials to NM, not SN. A form of address is not part of a name, and an
 * avatar that reads SN for every sister on the register identifies nobody.
 *
 * It lived in shells/StaffShell.tsx, which is where the sidebar that first needed it is. That was
 * fine until lib/roster.ts needed the same rule: a module in lib importing a shell pulls a screen
 * and everything under it into the import graph, and the graph closed — roster to the shell, the
 * shell to the dispatch board, the board back to roster — so the board read the roster before the
 * roster had been built. The rule is a rule about names rather than about a sidebar, so it is here,
 * and the shell reads it like everybody else.
 */
const HONORIFICS = /^(sister|brother|dr|mr|mrs|ms|prof)\b\.?$/i;
export function initialsOf(name: string) {
 const words = name.split(/\s+/).filter(w => !HONORIFICS.test(w));
 return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? name).slice(0, 2)).toUpperCase();
}
