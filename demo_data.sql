-- ============================================================
-- Demo data for apivit37463@gmail.com
-- Run this in your Supabase SQL Editor AFTER the main schema.
-- ============================================================

do $$
declare
  v_user_id   uuid;
  v_store_id  uuid;
begin
  -- Look up the user
  select id into v_user_id from auth.users where email = 'apivit37463@gmail.com';
  if v_user_id is null then
    raise exception 'User apivit37463@gmail.com not found. Make sure they have signed up first.';
  end if;

  -- Create a demo store
  insert into stores (id, name, location)
  values (gen_random_uuid(), 'Demo Grocery', '123 Main St')
  returning id into v_store_id;

  -- Make the user the owner
  insert into store_members (store_id, user_id, role)
  values (v_store_id, v_user_id, 'owner');

  -- Insert demo products
  insert into products (store_id, barcode, name, category, quantity, unit, expiry_date, notes) values
    (v_store_id, '8850329112893', 'Whole Milk 1L',        'Dairy',     24,  'pcs',  current_date + 5,  ''),
    (v_store_id, '8850329112894', 'Greek Yogurt 200g',    'Dairy',     18,  'pcs',  current_date + 10, ''),
    (v_store_id, '8850329112895', 'Cheddar Cheese 250g',  'Dairy',     12,  'pcs',  current_date + 30, ''),
    (v_store_id, '8850329112896', 'Sourdough Bread',      'Bakery',    8,   'pcs',  current_date + 3,  ''),
    (v_store_id, '8850329112897', 'Croissant',            'Bakery',    15,  'pcs',  current_date + 2,  ''),
    (v_store_id, '8850329112898', 'Orange Juice 1L',      'Beverages', 30,  'pcs',  current_date + 14, ''),
    (v_store_id, '8850329112899', 'Sparkling Water 500ml','Beverages', 48,  'pcs',  current_date + 180,''),
    (v_store_id, '8850329112900', 'Green Tea 25 bags',    'Beverages', 20,  'pcs',  current_date + 365,''),
    (v_store_id, '8850329112901', 'Chicken Breast 500g',  'Meat',      10,  'pcs',  current_date + 4,  'Keep refrigerated'),
    (v_store_id, '8850329112902', 'Salmon Fillet 300g',   'Meat',      8,   'pcs',  current_date + 2,  'Fresh, not frozen'),
    (v_store_id, '8850329112903', 'Eggs 12pcs',           'Dairy',     20,  'pcs',  current_date + 21, ''),
    (v_store_id, '8850329112904', 'Pasta 500g',           'Dry Goods', 35,  'pcs',  current_date + 730,''),
    (v_store_id, '8850329112905', 'Jasmine Rice 1kg',     'Dry Goods', 25,  'pcs',  current_date + 365,''),
    (v_store_id, '8850329112906', 'Olive Oil 500ml',      'Condiments',14,  'pcs',  current_date + 365,''),
    (v_store_id, '8850329112907', 'Tomato Sauce 400g',    'Condiments',22,  'pcs',  current_date + 540,''),
    (v_store_id, '8850329112908', 'Banana (bunch)',        'Produce',   30,  'pcs',  current_date + 6,  ''),
    (v_store_id, '8850329112909', 'Apple Fuji 1kg',       'Produce',   20,  'pcs',  current_date + 14, ''),
    (v_store_id, '8850329112910', 'Broccoli',             'Produce',   15,  'pcs',  current_date + 7,  ''),
    (v_store_id, '8850329112911', 'Frozen Pizza',         'Frozen',    10,  'pcs',  current_date + 90, ''),
    (v_store_id, '8850329112912', 'Vanilla Ice Cream 1L', 'Frozen',    8,   'pcs',  current_date + 120,'');

  -- Insert a few demo sales
  insert into sales (store_id, product_name, barcode, category, quantity_sold, sold_at) values
    (v_store_id, 'Whole Milk 1L',       '8850329112893', 'Dairy',     3, now() - interval '6 days'),
    (v_store_id, 'Sourdough Bread',     '8850329112896', 'Bakery',    5, now() - interval '5 days'),
    (v_store_id, 'Orange Juice 1L',     '8850329112898', 'Beverages', 4, now() - interval '4 days'),
    (v_store_id, 'Eggs 12pcs',          '8850329112903', 'Dairy',     6, now() - interval '3 days'),
    (v_store_id, 'Chicken Breast 500g', '8850329112901', 'Meat',      2, now() - interval '2 days'),
    (v_store_id, 'Pasta 500g',          '8850329112904', 'Dry Goods', 4, now() - interval '1 day'),
    (v_store_id, 'Banana (bunch)',       '8850329112908', 'Produce',   8, now() - interval '12 hours'),
    (v_store_id, 'Greek Yogurt 200g',   '8850329112894', 'Dairy',     3, now() - interval '2 hours');

  raise notice 'Demo data created! Store ID: %', v_store_id;
end;
$$;
