import { createApiGateServer } from "./api-gate-server.ts";
import { API_ORIGIN, GATE_PORT } from "./environment.ts";

// The API gate as the harness process that `playwright.config.ts` starts (see `api-gate.ts`).
createApiGateServer(API_ORIGIN).listen(GATE_PORT, "127.0.0.1");
