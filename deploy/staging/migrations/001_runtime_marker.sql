-- Synthetic operative marker; no domain tables or authorization are migrated.
CREATE TABLE staging_runtime.marker (id integer PRIMARY KEY CHECK (id = 1), kind text NOT NULL CHECK (kind = 'synthetic'));
INSERT INTO staging_runtime.marker(id, kind) VALUES (1, 'synthetic');
