import { expect, it } from "vitest";
import { accountConsentPath, consentReturnPath } from "./account-consent-routing";

it.each([undefined, ["/groups"], "https://evil.test", "//evil.test", "/\\evil.test", "/login", "/accept-terms", "/auth/callback?code=secret", "/reset-password?token=secret"])("retorno %j no escapa ni vuelve a autenticación", path => {
  expect(consentReturnPath(path)).toBe("/welcome");
});
it("preserva invitaciones válidas y descarta parámetros arbitrarios", () => {
  expect(consentReturnPath("/join?code=ABCD1234&secret=private")).toBe("/join?code=ABCD1234");
  expect(consentReturnPath("/join?code=ABCD1234&code=OTHER123")).toBe("/join");
  expect(consentReturnPath("/groups/group-id?token=secret")).toBe("/groups/group-id");
  expect(consentReturnPath("/invitations/" + "a".repeat(32))).toBe("/invitations/" + "a".repeat(32));
});
it("conserva QR únicamente en fragmento", () => {
  const url = new URL(accountConsentPath("/check-in#activity_id=synthetic&token=secret"), "https://asisteam.test");
  expect(url.searchParams.get("return_to")).toBe("/check-in");
  expect(url.search).not.toContain("secret");
  expect(url.hash).toBe("#activity_id=synthetic&token=secret");
});
