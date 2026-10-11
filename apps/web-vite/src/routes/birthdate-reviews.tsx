import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { browserApi,requireSession,sessionError } from "../api";
import { BirthdateReviews } from "../components/birthdate-reviews";
import { Page } from "../ui";
export async function loader({request}:LoaderFunctionArgs){await requireSession(request);try{return await browserApi(request.signal).listBirthdateReviews();}catch(error){return sessionError(error,request);}}
export function Component(){const result=useLoaderData<typeof loader>();return <Page><title>Correcciones de edad · Asisteam</title><h1>Correcciones de edad de mis grupos</h1><BirthdateReviews reviews={result.data}/></Page>;}
