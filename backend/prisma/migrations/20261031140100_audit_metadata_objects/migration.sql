-- logAudit used to store metadata as JSON.stringify(obj): a JSON *string* in a
-- jsonb column, which every reader (the admin Audit Log, the activity log) saw
-- as "no details". Unwrap those strings into the objects they encode. They were
-- all produced by JSON.stringify, so they parse; the pattern guard skips any
-- string that is not an object literal.
UPDATE "audit_logs"
SET "metadata" = ("metadata" #>> '{}')::jsonb
WHERE jsonb_typeof("metadata") = 'string'
  AND ("metadata" #>> '{}') ~ '^\s*\{.*\}\s*$';
