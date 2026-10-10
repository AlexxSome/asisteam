// Local navigation pictograms adopted from the UI-01 specimen.
const paths = {
  home: "M3 10 12 3l9 7v11h-6v-7H9v7H3Z",
  calendar: "M5 3v4m14-4v4M3 9h18M3 5h18v16H3Z",
  people: "M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 10v-3a6 6 0 0 1 12 0v3m3-16a3 3 0 0 1 0 6m1 3a5 5 0 0 1 4 5v2",
  check: "m5 12 4 4L19 6M3 3h18v18H3Z",
  report: "M5 20V10m7 10V4m7 16v-7",
  notice: "M4 9h5l11-5v16L9 15H4Zm3 6 2 6",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2",
};
export type ShellIconName = keyof typeof paths;
export function ShellIcon({ name }: { name: ShellIconName }) {
  return <svg aria-hidden="true" focusable="false" className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}
