-- WEB-02: opaque browser sessions; credentials are encrypted by Nest.
CREATE TABLE app_private.web_sessions (
 token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
 family_id uuid NOT NULL REFERENCES app_private.auth_families(id) ON DELETE CASCADE,
 credentials text NOT NULL CHECK (length(credentials) BETWEEN 1 AND 24000),
 expires_at timestamptz NOT NULL
);
ALTER TABLE app_private.web_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.web_sessions FROM PUBLIC, asisteam_api, asisteam_auth, asisteam_jobs;

CREATE FUNCTION app_private.web_session_operation(p_operation text, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_session app_private.web_sessions%rowtype; v_expiry timestamptz;
BEGIN
 IF NOT app_private.auth_is_native() THEN RETURN '{}'::jsonb; END IF;
 IF p_operation = 'open' THEN
  SELECT f.expires_at INTO v_expiry FROM app_private.auth_families f
   JOIN app_private.auth_subjects s ON s.id=f.subject_id
   JOIN public.users u ON u.auth_user_id=s.id
   WHERE f.id=(p_data->>'family_id')::uuid AND f.revoked_at IS NULL
    AND f.expires_at>clock_timestamp() AND u.account_status='ACTIVE'
    AND (s.disabled_until IS NULL OR s.disabled_until<=clock_timestamp());
  IF NOT FOUND THEN RETURN '{}'::jsonb; END IF;
  DELETE FROM app_private.web_sessions WHERE expires_at<clock_timestamp();
  INSERT INTO app_private.web_sessions(token_hash,family_id,credentials,expires_at)
   VALUES(p_data->>'token_hash',(p_data->>'family_id')::uuid,p_data->>'credentials',v_expiry);
  RETURN jsonb_build_object('expires_at',v_expiry);
 END IF;
 SELECT * INTO v_session FROM app_private.web_sessions WHERE token_hash=p_data->>'token_hash' FOR UPDATE;
 IF NOT FOUND THEN RETURN '{}'::jsonb; END IF;
 IF p_operation='close' THEN
  PERFORM app_private.auth_operation('logout',jsonb_build_object('session_id',v_session.family_id,
   'subject_id',(SELECT subject_id FROM app_private.auth_families WHERE id=v_session.family_id)));
  DELETE FROM app_private.web_sessions WHERE token_hash=v_session.token_hash;
  RETURN '{}'::jsonb;
 END IF;
 IF v_session.expires_at<=clock_timestamp() OR NOT EXISTS (
  SELECT 1 FROM app_private.auth_families f JOIN app_private.auth_subjects s ON s.id=f.subject_id
  JOIN public.users u ON u.auth_user_id=s.id WHERE f.id=v_session.family_id AND f.revoked_at IS NULL
   AND f.expires_at>clock_timestamp() AND u.account_status='ACTIVE'
   AND (s.disabled_until IS NULL OR s.disabled_until<=clock_timestamp())) THEN
  DELETE FROM app_private.web_sessions WHERE token_hash=v_session.token_hash;
  RETURN '{}'::jsonb;
 END IF;
 IF p_operation='save' THEN
  UPDATE app_private.web_sessions SET credentials=p_data->>'credentials' WHERE token_hash=v_session.token_hash;
 ELSIF p_operation<>'lock' THEN RAISE SQLSTATE 'PT400' USING MESSAGE='invalid_request'; END IF;
 RETURN jsonb_build_object('credentials',v_session.credentials,'expires_at',v_session.expires_at);
END $$;
REVOKE ALL ON FUNCTION app_private.web_session_operation(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.web_session_operation(text,jsonb) TO asisteam_auth;
