/**
 * Floe Runtime Core Contract
 *
 * This module defines the Floe-native endpoint processing contract.
 * It sits between floe-bridge (the service boundary) and any runtime adapter
 * (e.g., PiRuntimeAdapter). Code above this contract should not need to know
 * the internal assumptions of any specific runtime engine.
 *
 * Stack:
 *   floe-bus
 *   → floe-bridge
 *   → floe-runtime-core contract (this module)
 *   → RuntimeAdapter implementation (e.g., PiRuntimeAdapter)
 *   → runtime engine (e.g., pi-agent-core → pi-ai)
 */
export {};
