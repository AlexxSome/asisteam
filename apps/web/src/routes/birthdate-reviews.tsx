import { PageHeader } from "../components/ui/page-header";
import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { browserApi,requireSession,sessionError } from "../api";
import { BirthdateReviews } from "../components/birthdate-reviews";
import { Page, ActionLink } from "../ui";
export async function loader({request}:LoaderFunctionArgs){await requireSession(request);try{return await browserApi(request.signal).listBirthdateReviews();}catch(error){return sessionError(error,request);}}
export function Component(){const result=useLoaderData<typeof loader>();return <Page className="max-w-[672px] px-0 py-0 md:px-0 [overflow-wrap:anywhere]"><title>Correcciones de edad · Asisteam</title><PageHeader title="Correcciones de edad de mis grupos" description="Cada decisión se aplica al grupo indicado y conserva la protección vigente mientras se completa la revisión."/><BirthdateReviews reviews={result.data}/><ActionLink href="/profile">Volver a mi perfil</ActionLink></Page>;}
