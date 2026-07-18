create extension if not exists pgcrypto;

create table events (
  id uuid primary key default gen_random_uuid(),
  event_code text not null unique,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

create table access_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  kind text not null check (kind in ('event', 'temporary', 'global')),
  event_id uuid references events(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((kind = 'event') = (event_id is not null))
);

create table collection_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  kind text not null check (kind in ('event', 'temporary', 'global')),
  event_id uuid references events(id) on delete cascade,
  access_code_id uuid references access_codes(id) on delete set null,
  privacy_acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  last_write_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  check ((kind = 'event') = (event_id is not null))
);

create table observations (
  id uuid primary key default gen_random_uuid(),
  collection_session_id uuid not null references collection_sessions(id) on delete cascade,
  event_id uuid references events(id) on delete cascade,
  is_temporary boolean not null,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m double precision check (accuracy_m is null or accuracy_m >= 0),
  plant_reading double precision not null check (plant_reading >= 0 and plant_reading < 'Infinity'::double precision),
  sensor_color text not null check (sensor_color ~ '^#[0-9A-F]{6}$'),
  feeling text check (feeling is null or feeling in (
    'laughter', 'joy', 'calm', 'curiosity', 'surprise',
    'fear', 'sadness', 'anger', 'disgust', 'neutral'
  )),
  comment text check (comment is null or char_length(comment) <= 500),
  photo_drive_id text,
  photo_mime_type text,
  photo_extension text,
  audio_drive_id text,
  audio_mime_type text,
  audio_extension text,
  draft_created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_at timestamptz,
  check ((is_temporary and event_id is null) or (not is_temporary and event_id is not null)),
  check ((status = 'draft' and created_at is null) or (status = 'finalized' and created_at is not null)),
  check ((photo_drive_id is null and photo_mime_type is null and photo_extension is null)
    or (photo_drive_id is not null and photo_mime_type is not null and photo_extension is not null)),
  check ((audio_drive_id is null and audio_mime_type is null and audio_extension is null)
    or (audio_drive_id is not null and audio_mime_type is not null and audio_extension is not null))
);

create table app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create index observations_session_status_idx
  on observations(collection_session_id, status);
create index observations_event_status_idx
  on observations(event_id, status) where not is_temporary;
create index observations_draft_cleanup_idx
  on observations(updated_at) where status = 'draft';
create index temporary_sessions_cleanup_idx
  on collection_sessions(last_write_at) where kind = 'temporary';

alter table events enable row level security;
alter table access_codes enable row level security;
alter table collection_sessions enable row level security;
alter table observations enable row level security;
alter table app_config enable row level security;

revoke all on events, access_codes, collection_sessions, observations, app_config
  from anon, authenticated;
grant all on events, access_codes, collection_sessions, observations, app_config
  to service_role;

-- Example Event Code. Replace HYBRID-1 before running.
-- with new_event as (
--   insert into events (event_code) values (upper(trim('HYBRID-1'))) returning id
-- )
-- insert into access_codes (code_hash, kind, event_id)
-- select encode(digest(upper(trim('HYBRID-1')), 'sha256'), 'hex'), 'event', id
-- from new_event;

-- Example Temporary and Global Stats Codes. Replace both values before running.
-- insert into access_codes (code_hash, kind) values
--   (encode(digest(upper(trim('TEMP-0')), 'sha256'), 'hex'), 'temporary'),
--   (encode(digest(upper(trim('GLOBAL-STATS-CHANGE-ME')), 'sha256'), 'hex'), 'global');
