import { useEffect, useState } from 'react';
import { createThusoIQ, type Actor, type Command } from '../../../../packages/thusoiq/index.ts';
import { sandboxState } from '../../../../packages/thusoiq/fixtures.ts';
import { roleFromSearch } from './roles';
import { subjectById } from './vetting-fixtures';
import { summarise } from './vetting';

const actor = (): Actor => {
 const role = roleFromSearch(window.location.search);
 const id = role === 'doctor' ? 'D-401' : role === 'partner' ? 'P-501' : 'N-205';
 const subject = subjectById(id);
 const clearance = subject && summarise(subject);
 return { id, role: role === 'doctor' ? 'doctor' : role === 'partner' ? 'pharmacist' : 'nurse', verified: ['doctor','nurse','partner'].includes(role) && !!clearance && clearance.passed === clearance.total };
};
// One fictional session across role switches; never stored in browser storage or sent to the API.
const engine = createThusoIQ(sandboxState(), actor);
export function useThusoIQ() {
 const [state, setState] = useState(engine.snapshot);
 useEffect(() => engine.subscribe(() => setState(engine.snapshot())), []);
 const execute = (command: Command) => engine.execute(command, { expectedRevision: state.revision, idempotencyKey: crypto.randomUUID() });
 return { state, execute };
}
