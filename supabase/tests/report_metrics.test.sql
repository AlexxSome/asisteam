begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Fuente común: Vitest lee este JSON delimitado por $cases$ sin duplicar casos.
create temporary table report_metric_cases as
select * from jsonb_to_recordset($cases$[
  {"name":"HU-ADM-13: 8 convocadas","present":5,"late":1,"absent":1,"excused":1,"convened":8,"attendance_pct":85.7,"late_rate":16.7},
  {"name":"canónico 7 de 9","present":6,"late":1,"absent":2,"excused":1,"convened":10,"attendance_pct":77.8,"late_rate":14.3},
  {"name":"sin convocatorias","present":0,"late":0,"absent":0,"excused":0,"convened":0,"attendance_pct":null,"late_rate":null},
  {"name":"solo justificados","present":0,"late":0,"absent":0,"excused":4,"convened":4,"attendance_pct":null,"late_rate":null},
  {"name":"solo ausencias","present":0,"late":0,"absent":5,"excused":1,"convened":6,"attendance_pct":0,"late_rate":null},
  {"name":"todos atrasados","present":0,"late":2,"absent":0,"excused":0,"convened":2,"attendance_pct":100,"late_rate":100},
  {"name":"todos presentes","present":3,"late":0,"absent":0,"excused":1,"convened":4,"attendance_pct":100,"late_rate":0},
  {"name":"half-up asistencia","present":1,"late":0,"absent":15,"excused":0,"convened":16,"attendance_pct":6.3,"late_rate":0},
  {"name":"half-up atrasos","present":15,"late":1,"absent":0,"excused":0,"convened":16,"attendance_pct":100,"late_rate":6.3}
]$cases$::jsonb) as c(name text, present bigint, late bigint, absent bigint, excused bigint, convened bigint, attendance_pct numeric, late_rate numeric);
select is(m.attendance_pct, c.attendance_pct, c.name || ': porcentaje') from report_metric_cases c
cross join lateral app_private.attendance_metrics(c.present,c.late,c.absent,c.excused) m;
select is(m.late_rate, c.late_rate, c.name || ': puntualidad') from report_metric_cases c
cross join lateral app_private.attendance_metrics(c.present,c.late,c.absent,c.excused) m;
select is(m.convened, c.convened, c.name || ': convocadas') from report_metric_cases c
cross join lateral app_private.attendance_metrics(c.present,c.late,c.absent,c.excused) m;
select * from finish();
rollback;
