/** Temporary old-URL receiver. The target verifies the original signature and persists. */
export function createBillingWebhookRelay(target: string, transport: typeof fetch = fetch) {
  return async (request: Request): Promise<Response> => {
    try {
      const destination = new URL(target);
      if (destination.protocol !== 'https:' || destination.username || destination.password || destination.search || destination.hash
        || destination.pathname !== '/api/v1/billing/mercadopago-webhook') throw new Error('invalid_target');
      if (request.method !== 'POST') return new Response(null, {status:405});
      const original = new URL(request.url);
      const ids = original.searchParams.getAll('data.id');
      if (ids.length !== 1) return new Response(null, {status:400});
      const body = await request.text();
      if (body.length > 8192) return new Response(null, {status:400});
      destination.searchParams.set('data.id', ids[0]!);
      const headers = new Headers({'content-type':'application/json'});
      for (const key of ['x-signature','x-request-id']) {
        const value=request.headers.get(key);
        if(value)headers.set(key,value);
      }
      const result=await transport(destination,{method:'POST',headers,body,redirect:'error',signal:AbortSignal.timeout(60000)});
      // Never acknowledge on dispatch alone or expose downstream bodies/headers.
      return new Response(null,{status:result.status===200?200:503,headers:{'cache-control':'no-store'}});
    }catch{return new Response(null,{status:503,headers:{'cache-control':'no-store'}});}
  };
}
