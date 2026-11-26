import type { User, ProductionOrder, SavedDesign, WorkshopSettings } from '../types';
// Source fixtures removed from the public SQL snapshot; production is always empty.
export const SAMPLE_BAG_IMAGES = {};
export const INITIAL_USERS: User[] = [];
export const INITIAL_SETTINGS: WorkshopSettings = { unacceptedWarningMinutes: 30, plateDelayWarningMinutes: 60, printDelayWarningMinutes: 60, soundAlerts: true, autoPlayVoice: false };
export const INITIAL_SAVED_DESIGNS: SavedDesign[] = [];
export const INITIAL_ORDERS: ProductionOrder[] = [];
