import type { PaymentsMode } from "../../config/environment";

// What the presentation layer needs to know about the deployment's payment mode (M7 S4): `free` sells nothing and
// keeps Milestone 5's behavior, `simulated` runs the development provider. It is a separate token from the provider
// so a route can refuse a development-only action without asking the adapter.

export const PAYMENTS_MODE_TOKEN = Symbol("PaymentsMode");

export type PaymentsModeSetting = PaymentsMode;
