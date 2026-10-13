import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { ApiClientError } from "@asisteam/api-client";
import { browserApi } from "../api";
import { Page, Card, CardContent } from "../ui";
import { PageHeader } from "../components/ui/page-header";
import { CheckinForm } from "../components/check-in-form";
export async function loader({request}:LoaderFunctionArgs){
 try{const session=await browserApi(request.signal).getWebSession();return {authenticated:session.accepted};}catch(error){if(error instanceof ApiClientError && error.status===401)return {authenticated:false};throw error;}
}
export function Component(){const {authenticated}=useLoaderData<typeof loader>();return <Page className="max-w-2xl"><title>Registrar llegada · Asisteam</title><meta name="robots" content="noindex,nofollow"/><PageHeader title="Registrar llegada" description="Asistencia propia con el QR temporal de tu actividad."/><Card><CardContent className="p-4 sm:p-6"><CheckinForm authenticated={authenticated}/></CardContent></Card></Page>;}
