# Supabase setup

1. Create a free Supabase project.
2. Open **SQL Editor** and run the files in `migrations/` in numeric order.
3. Run edited copies of the commented Access Code examples at the bottom of `0001_initial.sql`.
4. Copy the project URL and `service_role` key into the Vercel environment variables described in the root README.

Access Codes are normalized with surrounding whitespace removed and letters uppercased before hashing. Closing an Event is a manual update:

```sql
update events set status = 'closed' where event_code = 'HYBRID-1';
```

Rotate an Event Code and its displayed value together:

```sql
with rotated_event as (
  update events
  set event_code = upper(trim('HYBRID-2'))
  where event_code = upper(trim('HYBRID-1'))
  returning id
), deactivate_old_code as (
  update access_codes
  set active = false
  where kind = 'event' and event_id in (select id from rotated_event)
)
insert into access_codes (code_hash, kind, event_id)
select encode(digest(upper(trim('HYBRID-2')), 'sha256'), 'hex'), 'event', id
from rotated_event;
```

Existing Collection Sessions continue to work after rotation.
