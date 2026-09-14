/* The Care engine's domain, in one import.
 *
 * Pure and dependency-free: nothing here opens a socket, reads a clock, writes a file or knows what a
 * bus is. Every act is handed its caller and `now`, and answers with a value and the events it
 * produced or with a refusal in the contract's words. The runtime binds these to routes and to the
 * bus; until it does, the web preview and the tests drive them directly. */
export * from './outcome.ts';
export * from './contract.ts';
export * from './clock.ts';
export * from './trust.ts';
export * from './matching.ts';
export * from './offers.ts';
export * from './checklist.ts';
export * from './visits.ts';
export * from './position.ts';
export * from './sync.ts';
