import { vi } from "vitest";
// Vitest runs server modules outside Next; the production boundary remains enforced by Next.
vi.mock("server-only", () => ({}));
