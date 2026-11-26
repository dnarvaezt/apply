CREATE FUNCTION "application_events_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'application_events is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "application_events_no_update_delete"
  BEFORE UPDATE OR DELETE ON "application_events"
  FOR EACH ROW EXECUTE FUNCTION "application_events_append_only"();
