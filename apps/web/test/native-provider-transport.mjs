/** External providers are synthetic; loopback requests still reach Nest. */
export function nativeProviderTransport({ network, email, billing }) {
  return async (input, init) => {
    const url = String(input);
    if (url.startsWith('https://api.pwnedpasswords.com/')) {
      if (!/^https:\/\/api\.pwnedpasswords\.com\/range\/[A-F0-9]{5}$/.test(url)) {
        throw new Error('unexpected_password_fixture_request');
      }
      // Valid k-anonymity response for synthetic passwords, as in native Auth QA.
      return new Response('A'.repeat(35) + ':0');
    }
    if (url.startsWith('https://api.resend.com/')) return email(input, init);
    if (url.startsWith('https://api.mercadopago.com/')) return billing(input, init);
    return network(input, init);
  };
}
