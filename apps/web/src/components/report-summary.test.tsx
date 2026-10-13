import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReportSummary } from "./report-summary";
import { reportAttendanceClass } from "../attendance-presentation";

afterEach(cleanup);
describe("resumen autorizado de reportes", () => {
  it.each([77.8, null, 0, 69.9, 70, 84.9, 85])("conserva valor y tono core para %s", value => {
    render(<ReportSummary label="Grupo sintético · mes" items={[{label:"Asistencia",value,percentage:true,attendance:true,description:"Período del grupo"}]} />);
    const text = value === null ? "Sin datos" : `${value.toFixed(1)} %`;
    const metric = screen.getByText(text);
    expect(metric.className).toContain(reportAttendanceClass(value));
    expect(screen.getByRole("region", {name:"Grupo sintético · mes"}).contains(metric)).toBe(true);
  });
  it("conserva total ponderado y promedio individual distintos sin recalcular", () => {
    render(<ReportSummary label="Resumen" items={[
      {label:"Total ponderado",value:77.8,percentage:true,description:"Conteos sumados"},
      {label:"Promedio individual",value:50,percentage:true,description:"Porcentajes disponibles"},
      {label:"Convocadas",value:0,description:"Registros del período"},
    ]} />);
    expect(screen.getByText("77.8 %")).toBeTruthy();
    expect(screen.getByText("50.0 %")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
  });
});
