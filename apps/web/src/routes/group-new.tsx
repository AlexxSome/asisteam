import { PageHeader } from "../components/ui/page-header";
import { type LoaderFunctionArgs } from "react-router";
import { requireSession } from "../api";
import { GroupForm } from "../components/group-form";
import { Page, ActionLink } from "../ui";
export const loader=({request}:LoaderFunctionArgs)=>requireSession(request);
export function Component(){return <Page className="max-w-[672px] px-0 py-0 md:px-0"><title>Crear grupo · Asisteam</title><PageHeader title="Crear un grupo" description="Configura tu club o equipo y revisa los pasos de activación."/><GroupForm/><ActionLink href="/groups">Volver a mis grupos</ActionLink></Page>;}
