-- Reverse recipe-based inventory consumption exactly once when an order is cancelled.

create or replace function public.reverse_inventory_for_cancelled_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx record;
  v_reversal_exists boolean;
begin
  if new.status <> 'cancelled' or old.status = 'cancelled' then
    return new;
  end if;

  for v_tx in
    select *
    from public.inventory_transactions
    where order_id = new.id
      and transaction_type = 'sale_consumption'
      and quantity < 0
  loop
    select exists (
      select 1 from public.inventory_transactions r
      where r.order_id = new.id
        and r.inventory_item_id = v_tx.inventory_item_id
        and r.transaction_type = 'sale_reversal'
        and r.reference = v_tx.id::text
    ) into v_reversal_exists;

    if not v_reversal_exists then
      update public.inventory_items
      set current_stock = current_stock + abs(v_tx.quantity),
          updated_at = now()
      where id = v_tx.inventory_item_id;

      insert into public.inventory_transactions (
        company_id, location_id, inventory_item_id, order_id,
        transaction_type, quantity, unit_cost, reference, notes
      ) values (
        v_tx.company_id, v_tx.location_id, v_tx.inventory_item_id, new.id,
        'sale_reversal', abs(v_tx.quantity), v_tx.unit_cost, v_tx.id::text,
        'Automatic inventory reversal for cancelled order ' || coalesce(new.order_number, new.id::text)
      );
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_reverse_inventory_on_order_cancel on public.orders;
create trigger trg_reverse_inventory_on_order_cancel
after update of status on public.orders
for each row
execute function public.reverse_inventory_for_cancelled_order();

create index if not exists inventory_transactions_reversal_idx
on public.inventory_transactions(order_id, transaction_type, inventory_item_id);

comment on function public.reverse_inventory_for_cancelled_order() is
'Restores recipe inventory once when an order changes to cancelled.';
