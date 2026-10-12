// Strict pagination: duplicate/invalid parameters never become an empty wall/ledger.
export function pageQuery(request:Request,max:number){
 const query=new URL(request.url).searchParams,raw=query.get("page")??"1",page=Number(raw);
 if(query.getAll("page").length>1 || !/^\d+$/.test(raw) || !Number.isSafeInteger(page) || page<1 || page>max)throw new Response(null,{status:404});
 return page;
}
