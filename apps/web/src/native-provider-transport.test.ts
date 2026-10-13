import { expect, it, vi } from 'vitest';
import { nativeProviderTransport } from '../test/native-provider-transport.mjs';

it('aisla HIBP de la red aun cuando el proveedor real está caído', async () => {
  const network=vi.fn().mockRejectedValue(new Error('external-provider-unavailable'));
  const email=vi.fn(),billing=vi.fn();
  const transport=nativeProviderTransport({network,email,billing});
  for (const prefix of ['ABCDE','01234','FFFFF']) {
    const response=await transport('https://api.pwnedpasswords.com/range/'+prefix,{headers:{'Add-Padding':'true'}});
    expect(response.ok).toBe(true);
    expect(await response.text()).toMatch(/^[A-F0-9]{35}:0$/);
  }
  expect(network).not.toHaveBeenCalled();
  expect(email).not.toHaveBeenCalled();
  expect(billing).not.toHaveBeenCalled();
  await expect(transport('https://api.pwnedpasswords.com/range/full-digest')).rejects.toThrow('unexpected_password_fixture_request');
  expect(network).not.toHaveBeenCalled();
});

it('conserva transports sintéticos independientes y HTTP real hacia Nest local', async () => {
  const network=vi.fn().mockResolvedValue(new Response('nest'));
  const email=vi.fn().mockResolvedValue(new Response('email'));
  const billing=vi.fn().mockResolvedValue(new Response('billing'));
  const transport=nativeProviderTransport({network,email,billing});
  const init={method:'POST',body:'{}'};
  expect(await (await transport('https://api.resend.com/emails',init)).text()).toBe('email');
  expect(await (await transport('https://api.mercadopago.com/preapproval',init)).text()).toBe('billing');
  expect(await (await transport('http://127.0.0.1:3120/api/v1/invitations/register',init)).text()).toBe('nest');
  expect(email).toHaveBeenCalledExactlyOnceWith('https://api.resend.com/emails',init);
  expect(billing).toHaveBeenCalledExactlyOnceWith('https://api.mercadopago.com/preapproval',init);
  expect(network).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:3120/api/v1/invitations/register',init);
});
