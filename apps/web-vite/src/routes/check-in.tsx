import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { ApiClientError } from "@asisteam/api-client";
import { browserApi } from "../api";
import { Page } from "../ui";
import { CheckinForm } from "../components/check-in-form";
export async function loader({request}:LoaderFunctionArgs){
 try{const session=await browserApi(request.signal).getWebSession();return {authenticated:session.accepted};}catch(error){if(error instanceof ApiClientError && error.status===401)return {authenticated:false};throw error;}
}
export function Component(){const {authenticated}=useLoaderData<typeof loader>();return <Page><title>Registrar llegada · Asisteam</title><meta name="robots" content="noindex,nofollow"/><h1 className="text-h1">Registrar llegada</h1><CheckinForm authenticated={authenticated}/></Page>;}
