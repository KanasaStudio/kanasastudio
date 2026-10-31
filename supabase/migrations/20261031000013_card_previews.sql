-- Optional short preview video on portfolio, store and tools cards (plays on hover / when in view).
alter table public.portfolio_projects add column if not exists preview_video_url text check (preview_video_url is null or preview_video_url ~ '^https://[^\s]+$');
alter table public.products add column if not exists preview_video_url text check (preview_video_url is null or preview_video_url ~ '^https://[^\s]+$');
alter table public.resources add column if not exists preview_video_url text check (preview_video_url is null or preview_video_url ~ '^https://[^\s]+$');
alter table public.resources add column if not exists cover_url text check (cover_url is null or cover_url ~ '^https://[^\s]+$' or cover_url ~ '^assets/');
