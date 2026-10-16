// workerd does not implement redirect: 'error'. Use 'manual' and reject 3xx
// explicitly so a provider can never forward credentials to a new destination.
export class OfficialRedirectError extends Error {
  constructor(){super('Official API returned an unexpected redirect');this.name='OfficialRedirectError';}
}
export async function fetchOfficial(url,init={},fetcher=fetch){
  const response=await fetcher(url,{...init,redirect:'manual'});
  if(response.status>=300&&response.status<400){
    await response.body?.cancel().catch(()=>{});
    throw new OfficialRedirectError();
  }
  return response;
}
