import { type LoaderFunctionArgs } from "react-router";
import { requireSession } from "../api";
import { GroupForm } from "../components/group-form";
import { Page } from "../ui";
export const loader=({request}:LoaderFunctionArgs)=>requireSession(request);
export function Component(){return <Page><title>Crear grupo · Asisteam</title><h1>Crear un grupo</h1><GroupForm/></Page>;}
