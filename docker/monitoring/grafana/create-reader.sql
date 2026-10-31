\getenv readonly_password GRAFANA_DB_READONLY_PASSWORD

SELECT format('CREATE ROLE grafana_reader LOGIN PASSWORD %L', :'readonly_password')
WHERE NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'grafana_reader'
)
\gexec

ALTER ROLE grafana_reader LOGIN PASSWORD :'readonly_password';
ALTER ROLE grafana_reader SET default_transaction_read_only = on;

GRANT USAGE ON SCHEMA public TO grafana_reader;
GRANT SELECT (created_at) ON TABLE ai_chat_conversations TO grafana_reader;
GRANT SELECT (created_at, role) ON TABLE ai_chat_messages TO grafana_reader;
GRANT SELECT (created_at) ON TABLE ai_usage_events TO grafana_reader;
