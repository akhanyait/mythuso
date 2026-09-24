import { createContext, useContext } from 'react';
import type { VettingState } from '../Vetting';
import type { PortalPlace } from '../../lib/portal';
import type { RoleId } from '../../lib/roles';

/* What every category screen needs from the shell, without eleven props on every one of them.
 *
 * `vetting` is held once, above every category, for the reason the back office held it above its tabs:
 * a decision taken in Vetting has to still be true on the Dispatch board, or the gate is a screenshot
 * of a gate. `settingsEngine` is the same arrangement for the one link that opens Configuration on a
 * particular engine's settings. */
export type PortalContextValue = {
 readonly audience: RoleId;
 readonly place: PortalPlace;
 readonly go: (category: string, tab?: string) => void;
 readonly open: (modal: string) => void;
 readonly vetting: VettingState;
 readonly settingsEngine: string;
 readonly setSettingsEngine: (engine: string) => void;
};
export const PortalContext = createContext<PortalContextValue | null>(null);
export function usePortal(): PortalContextValue {
 const value = useContext(PortalContext);
 /* Loud: a category rendered outside the shell has no place and no shared state, and drawing it
    anyway would be drawing a second, disagreeing copy of the vetting register. */
 if (!value) throw new Error('A Control Tower category was rendered outside the portal shell.');
 return value;
}
