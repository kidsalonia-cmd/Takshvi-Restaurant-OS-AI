-- Automatic recipe-based inventory deduction for every order source.
-- Runs whenever an order item is inserted (POS, Zomato, Swiggy, website, phone, etc.).

create or replace function public.deduct_inventory_for_order_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_location_id uuid;
  v_order_number text;
  v_recipe_id uuid;
  v_yield numeric(10,3);
  v_ingredient record;
  v_deduction numeric(14,3);
begin
  -- Items without a linked menu item cannot use a recipe.
  if new.menu_item_id is null then
    return new;
  end if;

  select o.company_id, o.location_id, o.order_number
    into v_company_id, v_location_id, v_order_number
  from public.orders o
  where o.id = new.order_id;

  if v_location_id is null then
    raise exception 'Order % was not found for inventory deduction.', new.order_id;
  end if;

  select r.id, greatest(r.yield_quantity, 0.001)
    into v_recipe_id, v_yield
  from public.recipes r
  where r.location_id = v_location_id
    and r.menu_item_id = new.menu_item_id
  limit 1;

  -- A menu item without a configured recipe is allowed; no stock is deducted.
  if v_recipe_id is null then
    return new;
  end if;

  for v_ingredient in
    select
      ri.inventory_item_id,
      ri.quantity,
      ri.wastage_percent,
      ii.average_cost
    from public.recipe_ingredients ri
    join public.inventory_items ii
      on ii.id = ri.inventory_item_id
    where ri.recipe_id = v_recipe_id
      and ii.location_id = v_location_id
      and ii.is_active = true
  loop
    v_deduction := round(
      ((v_ingredient.quantity * new.quantity) / v_yield)
      * (1 + (coalesce(v_ingredient.wastage_percent, 0) / 100)),
      3
    );

    if v_deduction <= 0 then
      continue;
    end if;

    update public.inventory_items
    set current_stock = current_stock - v_deduction,
        updated_at = now()
    where id = v_ingredient.inventory_item_id
      and location_id = v_location_id;

    insert into public.inventory_transactions (
      company_id,
      location_id,
      inventory_item_id,
      order_id,
      transaction_type,
      quantity,
      unit_cost,
      reference,
      notes
    ) values (
      v_company_id,
      v_location_id,
      v_ingredient.inventory_item_id,
      new.order_id,
      'sale_consumption',
      -v_deduction,
      v_ingredient.average_cost,
      coalesce(v_order_number, new.order_id::text),
      'Automatic recipe consumption for ' || new.item_name ||
      ' x ' || new.quantity::text || ' (order item ' || new.id::text || ')'
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_deduct_inventory_after_order_item on public.order_items;

create trigger trg_deduct_inventory_after_order_item
after insert on public.order_items
for each row
execute function public.deduct_inventory_for_order_item();

-- Prevent duplicate automatic consumption entries for the same order item and ingredient.
-- The order-item UUID is stored inside notes by the trigger, while the normal insert path
-- itself executes only once per order_items row.

create index if not exists inventory_transactions_order_id_idx
  on public.inventory_transactions(order_id);

create index if not exists inventory_transactions_type_created_idx
  on public.inventory_transactions(transaction_type, created_at desc);

comment on function public.deduct_inventory_for_order_item() is
'Automatically deducts recipe ingredients from location inventory when an order item is created.';
