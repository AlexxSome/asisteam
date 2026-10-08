import { completeSocialCallback } from '@/lib/api/social-auth';
async function callback(request:Request,{params}:{params:Promise<{provider:string}>}){
  return completeSocialCallback(request,(await params).provider);
}
export const GET=callback;
export const POST=callback;
