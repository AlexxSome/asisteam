import { z } from "zod";

/** Contrato de errores HTTP, doc 07. No incluir excepciones internas en details. */
export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.record(z.unknown()),
  }).strict(),
}).strict();
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
