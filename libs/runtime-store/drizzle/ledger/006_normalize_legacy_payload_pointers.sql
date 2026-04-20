update events
set data = '{}'::jsonb
where data ? '__synapse_event_payload_file_v1';
