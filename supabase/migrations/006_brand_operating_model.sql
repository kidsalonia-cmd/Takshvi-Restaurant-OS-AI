alter table brands
add column if not exists operating_model text not null default 'cloud_kitchen';

alter table brands
drop constraint if exists brands_operating_model_check;

alter table brands
add constraint brands_operating_model_check
check (operating_model in ('cloud_kitchen', 'physical_store', 'hybrid'));

create index if not exists brands_operating_model_idx
on brands(operating_model);
