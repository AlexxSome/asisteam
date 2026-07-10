-- HU-GEN-02 — Inicio de sesión (issue #14): invariante de datos que
-- garantiza el criterio de aceptación 3 (una cuenta MANAGED nunca puede
-- iniciar sesión). auth_user_id NULL significa que no existe fila en
-- auth.users, por lo que Supabase Auth signInWithPassword falla siempre
-- para el email de una cuenta MANAGED, con el mismo error genérico que
-- unas credenciales incorrectas (docs/07-api-y-backend.md §7.3).
alter table public.users
    add constraint users_managed_has_no_auth_user
    check (account_status <> 'MANAGED' or auth_user_id is null);
