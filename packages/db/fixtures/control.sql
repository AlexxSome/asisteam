-- Clean installs start after all source handoffs. Imported deployments must
-- restore their actual control/history rows and reconcile before admission.
INSERT INTO app_private.auth_authority(singleton,mode,activated_at) VALUES(true,'NATIVE',now());
INSERT INTO app_private.majority_executor(singleton,mode) VALUES(true,'WORKER');
INSERT INTO app_private.announcement_executor(singleton,mode,activated_at) VALUES(true,'WORKER',now());
INSERT INTO app_private.billing_transport(singleton,mode) VALUES(true,'NEST');
