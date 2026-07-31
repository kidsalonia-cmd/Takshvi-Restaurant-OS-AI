alter table locations add column if not exists location_type text not null default 'cloud_kitchen';

alter table locations drop constraint if exists locations_location_type_check;
alter table locations add constraint locations_location_type_check check (location_type in ('cloud_kitchen', 'physical_store', 'hybrid'));
