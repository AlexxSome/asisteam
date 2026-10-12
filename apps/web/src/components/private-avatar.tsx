import { useEffect, useState } from "react";
import { httpSchemas } from "@asisteam/core/browser";
import { browserApi } from "../api";
/** No S3 URL reaches the browser; every read checks current SQL visibility. */
export function PrivateAvatar({path,alt,className="size-24 rounded-full object-cover"}:{path:string;alt:string;className?:string}) {
 const [image,setImage]=useState<string|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{
  const controller=new AbortController(); let object:string|undefined;
  setImage(null);setFailed(false);
  const parts=/^\/profile\/avatar\/([^/]+)\/([^/]+)$/.exec(path);
  const parsed=httpSchemas.AvatarParams.safeParse({ownerId:parts?.[1],fileName:parts?.[2]});
  if(!parsed.success){setFailed(true);return;}
  void browserApi(controller.signal).getAvatar({params:parsed.data}).then(data=>{
   if(controller.signal.aborted)return;
   const bytes=Uint8Array.from(atob(data.content_base64),value=>value.charCodeAt(0));
   object=URL.createObjectURL(new Blob([bytes],{type:data.type}));setImage(object);
  }).catch(()=>{if(!controller.signal.aborted)setFailed(true);});
  return()=>{controller.abort();if(object)URL.revokeObjectURL(object);};
 },[path]);
 return image?<img src={image} alt={alt} width={96} height={96} className={className} onError={()=>{setFailed(true);setImage(null);}}/>:<p role="status">{failed?"Foto no disponible":"Cargando foto…"}</p>;
}
