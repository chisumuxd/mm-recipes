-- ตำเรือน: โครงสร้างฐานข้อมูลสำหรับ Supabase
-- วิธีใช้: เปิด Supabase > SQL Editor > New query > วางไฟล์นี้ทั้งหมด > Run (รันครั้งเดียว)
--
-- สิ่งที่ไฟล์นี้สร้าง
--   ตาราง   site_settings, products, promotions, profiles, orders
--   สิทธิ์   ทุกตารางเปิด Row Level Security: คนทั่วไปอ่านได้เฉพาะข้อมูลหน้าเว็บ
--           สมาชิกอ่านได้เฉพาะข้อมูลของตัวเอง แอดมินอ่านได้ทั้งหมด
--   การแก้ไข ทำผ่านฟังก์ชันเท่านั้น (ไม่มีใครเขียนตารางตรง ๆ ได้) ฟังก์ชันแอดมินตรวจสิทธิ์ทุกครั้ง
--   ที่เก็บรูป bucket ชื่อ product-images (อ่านได้ทุกคน อัปโหลดได้เฉพาะแอดมิน)

-- ---------------------------------------------------------------- tables

create table public.site_settings (
  id                      int primary key default 1 check (id = 1),   -- one row only
  brand_name              text not null default 'ตำเรือน',
  line_id                 text not null default '',                    -- LINE Official Account id, with its @
  hero_title              text not null default 'น้ำพริกกระปุก สั่งออนไลน์ ส่งถึงบ้าน',
  hero_lead               text not null default 'น้ำพริกหนุ่ม น้ำพริกแคบหมู น้ำพริกนรก และน้ำพริกเผา เลือกสูตรและจำนวนบนหน้านี้ แล้วส่งออเดอร์เข้า LINE ของร้าน กระปุกละ 79 บาทขึ้นไป',
  products_title          text not null default 'น้ำพริกสี่สูตร',
  products_lead           text not null default 'ทุกสูตรบรรจุกระปุก สั่งคละสูตรได้ในออเดอร์เดียว',
  promo_title             text not null default 'โปรโมชั่นซื้อหลายกระปุก',
  promo_lead              text not null default 'ส่วนลดคิดจากจำนวนกระปุกทั้งออเดอร์ คละสูตรได้ และหักให้ทันทีในยอดรวม',
  close_title             text not null default 'น้ำพริกสี่สูตร ส่งถึงบ้าน',
  footer_lede             text not null default 'น้ำพริกกระปุก สั่งทาง LINE',
  member_discount_percent int  not null default 0 check (member_discount_percent between 0 and 50),
  updated_at              timestamptz not null default now()
);

create table public.products (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(name) between 1 and 60),
  price       int  not null check (price between 1 and 100000),        -- baht, whole numbers
  weight      text not null default '' check (char_length(weight) <= 30),
  ingredients text not null default '' check (char_length(ingredients) <= 80),
  description text not null default '' check (char_length(description) <= 120),
  image_url   text not null default '' check (char_length(image_url) <= 500),
  image_alt   text not null default '' check (char_length(image_alt) <= 160),
  sort        int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.promotions (
  id       bigint generated always as identity primary key,
  min_jars int not null unique check (min_jars between 2 and 999),
  percent  int not null check (percent between 1 and 90)
);

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null default '',
  full_name  text not null default '' check (char_length(full_name) <= 120),
  address    text not null default '' check (char_length(address) <= 600),
  role       text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now()
);

create table public.orders (
  id                      bigint generated always as identity primary key,
  user_id                 uuid references auth.users (id) on delete set null,   -- null: a guest
  customer_name           text not null,
  address                 text not null,
  items                   jsonb not null,          -- [{product_id, name, price, qty, line_total}]
  jars                    int not null,
  subtotal                int not null,
  promo_percent           int not null default 0,
  promo_discount          int not null default 0,
  member_percent          int not null default 0,
  member_discount         int not null default 0,
  total                   int not null,
  status                  text not null default 'new' check (status in ('new', 'confirmed', 'shipped', 'cancelled')),
  client_hash             text,                    -- a hash of the sender's address, only to slow down spam
  created_at              timestamptz not null default now()
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_created_idx on public.orders (created_at desc);

-- ---------------------------------------------------------------- who is an admin

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
$$;

-- every new account gets a profile row (role member)
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- row level security: reading
-- No insert, update or delete policy exists on any table: every change goes through a function below.

alter table public.site_settings enable row level security;
alter table public.products      enable row level security;
alter table public.promotions    enable row level security;
alter table public.profiles      enable row level security;
alter table public.orders        enable row level security;

create policy "anyone reads the settings"   on public.site_settings for select using (true);
create policy "anyone reads active products" on public.products     for select using (active or (select public.is_admin()));
create policy "anyone reads promotions"     on public.promotions    for select using (true);
create policy "own profile, or admin"       on public.profiles      for select using (id = (select auth.uid()) or (select public.is_admin()));
create policy "own orders, or admin"        on public.orders        for select using (user_id = (select auth.uid()) or (select public.is_admin()));

-- ---------------------------------------------------------------- the page

create function public.get_site() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'settings', (select to_jsonb(s) - 'id' - 'updated_at' from public.site_settings s where s.id = 1),
    'products', coalesce((select jsonb_agg(to_jsonb(p) - 'created_at' - 'active' order by p.sort, p.id)
                          from public.products p where p.active), '[]'::jsonb),
    'promotions', coalesce((select jsonb_agg(jsonb_build_object('min_jars', r.min_jars, 'percent', r.percent) order by r.min_jars)
                            from public.promotions r), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------- orders
-- The prices, the promotion and the member discount are read here, from the tables, never from the browser.

create function public.place_order(p_items jsonb, p_name text, p_address text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid      uuid := (select auth.uid());
  v_item     jsonb;
  v_qty      int;
  v_product  public.products%rowtype;
  v_lines    jsonb := '[]'::jsonb;
  v_jars     int := 0;
  v_subtotal int := 0;
  v_promo    int := 0;
  v_member   int := 0;
  v_promo_discount  int;
  v_member_discount int;
  v_total    int;
  v_ip       text;
  v_hash     text;
  v_id       bigint;
begin
  p_name := btrim(coalesce(p_name, ''));
  p_address := btrim(coalesce(p_address, ''));
  if char_length(p_name) not between 1 and 120 then raise exception 'name_required' using errcode = '22023'; end if;
  if char_length(p_address) not between 5 and 600 then raise exception 'address_required' using errcode = '22023'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'items_required' using errcode = '22023';
  end if;

  -- slow down spam: five orders from one address in ten minutes at most
  begin
    v_ip := split_part(coalesce(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', ''), ',', 1);
  exception when others then v_ip := '';
  end;
  if coalesce(v_ip, '') <> '' then
    v_hash := md5(v_ip || to_char(now(), 'YYYY-MM-DD'));
    if (select count(*) from public.orders o where o.client_hash = v_hash and o.created_at > now() - interval '10 minutes') >= 5 then
      raise exception 'too_many_orders' using errcode = '54000';
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item -> 'qty') <> 'number' or jsonb_typeof(v_item -> 'product_id') <> 'number' then
      raise exception 'bad_item' using errcode = '22023';
    end if;
    v_qty := (v_item ->> 'qty')::numeric;
    if v_qty is null or v_qty < 1 or v_qty > 99 or (v_item ->> 'qty')::numeric <> v_qty then
      raise exception 'bad_quantity' using errcode = '22023';
    end if;
    select * into v_product from public.products p where p.id = (v_item ->> 'product_id')::bigint and p.active;
    if not found then raise exception 'product_not_found' using errcode = '22023'; end if;
    v_jars := v_jars + v_qty;
    v_subtotal := v_subtotal + v_product.price * v_qty;
    v_lines := v_lines || jsonb_build_object('product_id', v_product.id, 'name', v_product.name,
                                             'price', v_product.price, 'qty', v_qty, 'line_total', v_product.price * v_qty);
  end loop;

  -- the promotion: the best percent among the steps the order reaches
  select coalesce(max(r.percent), 0) into v_promo from public.promotions r where r.min_jars <= v_jars;
  -- the member discount, on what is left after the promotion
  if v_uid is not null then
    select s.member_discount_percent into v_member from public.site_settings s where s.id = 1;
  end if;
  v_promo_discount  := round(v_subtotal * v_promo / 100.0);
  v_member_discount := round((v_subtotal - v_promo_discount) * coalesce(v_member, 0) / 100.0);
  v_total := v_subtotal - v_promo_discount - v_member_discount;

  insert into public.orders (user_id, customer_name, address, items, jars, subtotal, promo_percent, promo_discount,
                             member_percent, member_discount, total, client_hash)
  values (v_uid, p_name, p_address, v_lines, v_jars, v_subtotal, v_promo, v_promo_discount,
          coalesce(v_member, 0), v_member_discount, v_total, v_hash)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'items', v_lines, 'jars', v_jars, 'subtotal', v_subtotal,
    'promo_percent', v_promo, 'promo_discount', v_promo_discount,
    'member_percent', coalesce(v_member, 0), 'member_discount', v_member_discount, 'total', v_total);
end;
$$;

-- ---------------------------------------------------------------- members

create function public.get_my_account() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  return jsonb_build_object(
    'profile', (select jsonb_build_object('email', p.email, 'full_name', p.full_name, 'address', p.address, 'role', p.role)
                from public.profiles p where p.id = v_uid),
    'member_discount_percent', (select s.member_discount_percent from public.site_settings s where s.id = 1),
    'orders', coalesce((select jsonb_agg(to_jsonb(o) - 'client_hash' - 'user_id' order by o.created_at desc)
                        from (select * from public.orders where user_id = v_uid order by created_at desc limit 100) o), '[]'::jsonb)
  );
end;
$$;

create function public.save_my_profile(p_full_name text, p_address text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  update public.profiles
     set full_name = left(btrim(coalesce(p_full_name, '')), 120), address = left(btrim(coalesce(p_address, '')), 600)
   where id = v_uid;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- the admin
-- Each function stops at once for anyone who is not an admin.

create function public.admin_require() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
end;
$$;

create function public.admin_get_dashboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_require();
  return jsonb_build_object(
    'settings', (select to_jsonb(s) - 'id' from public.site_settings s where s.id = 1),
    'products', coalesce((select jsonb_agg(to_jsonb(p) order by p.sort, p.id) from public.products p), '[]'::jsonb),
    'promotions', coalesce((select jsonb_agg(jsonb_build_object('min_jars', r.min_jars, 'percent', r.percent) order by r.min_jars)
                            from public.promotions r), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(to_jsonb(o) - 'client_hash' order by o.created_at desc)
                        from (select * from public.orders order by created_at desc limit 300) o), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'email', m.email, 'full_name', m.full_name,
                                'address', m.address, 'role', m.role, 'created_at', m.created_at,
                                'orders', (select count(*) from public.orders o where o.user_id = m.id)) order by m.created_at desc)
                         from public.profiles m), '[]'::jsonb)
  );
end;
$$;

create function public.admin_save_settings(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_require();
  update public.site_settings s set
    brand_name    = left(btrim(coalesce(p ->> 'brand_name', s.brand_name)), 40),
    line_id       = left(btrim(coalesce(p ->> 'line_id', s.line_id)), 40),
    hero_title    = left(btrim(coalesce(p ->> 'hero_title', s.hero_title)), 80),
    hero_lead     = left(btrim(coalesce(p ->> 'hero_lead', s.hero_lead)), 300),
    products_title = left(btrim(coalesce(p ->> 'products_title', s.products_title)), 60),
    products_lead = left(btrim(coalesce(p ->> 'products_lead', s.products_lead)), 160),
    promo_title   = left(btrim(coalesce(p ->> 'promo_title', s.promo_title)), 60),
    promo_lead    = left(btrim(coalesce(p ->> 'promo_lead', s.promo_lead)), 200),
    close_title   = left(btrim(coalesce(p ->> 'close_title', s.close_title)), 60),
    footer_lede   = left(btrim(coalesce(p ->> 'footer_lede', s.footer_lede)), 80),
    member_discount_percent = coalesce((p ->> 'member_discount_percent')::int, s.member_discount_percent),
    updated_at    = now()
  where s.id = 1;
  if (select char_length(brand_name) from public.site_settings where id = 1) = 0 then
    raise exception 'brand_required' using errcode = '22023';
  end if;
  return (select to_jsonb(s) - 'id' from public.site_settings s where s.id = 1);
end;
$$;

-- p holds a product; with "id" it changes that product, without it adds one
create function public.admin_save_product(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id bigint := (p ->> 'id')::bigint;
begin
  perform public.admin_require();
  if v_id is null then
    insert into public.products (name, price, weight, ingredients, description, image_url, image_alt, sort, active)
    values (btrim(p ->> 'name'), (p ->> 'price')::int, btrim(coalesce(p ->> 'weight', '')), btrim(coalesce(p ->> 'ingredients', '')),
            btrim(coalesce(p ->> 'description', '')), btrim(coalesce(p ->> 'image_url', '')), btrim(coalesce(p ->> 'image_alt', '')),
            coalesce((p ->> 'sort')::int, (select coalesce(max(sort), 0) + 10 from public.products)),
            coalesce((p ->> 'active')::boolean, true))
    returning id into v_id;
  else
    update public.products t set
      name        = btrim(coalesce(p ->> 'name', t.name)),
      price       = coalesce((p ->> 'price')::int, t.price),
      weight      = btrim(coalesce(p ->> 'weight', t.weight)),
      ingredients = btrim(coalesce(p ->> 'ingredients', t.ingredients)),
      description = btrim(coalesce(p ->> 'description', t.description)),
      image_url   = btrim(coalesce(p ->> 'image_url', t.image_url)),
      image_alt   = btrim(coalesce(p ->> 'image_alt', t.image_alt)),
      sort        = coalesce((p ->> 'sort')::int, t.sort),
      active      = coalesce((p ->> 'active')::boolean, t.active)
    where t.id = v_id;
    if not found then raise exception 'product_not_found' using errcode = '22023'; end if;
  end if;
  return (select to_jsonb(t) from public.products t where t.id = v_id);
end;
$$;

create function public.admin_delete_product(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_require();
  delete from public.products where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- p is the whole list: [{min_jars, percent}], replacing what was there
create function public.admin_save_promotions(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_require();
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 10 then
    raise exception 'bad_promotions' using errcode = '22023';
  end if;
  delete from public.promotions where true;
  insert into public.promotions (min_jars, percent)
  select (x ->> 'min_jars')::int, (x ->> 'percent')::int from jsonb_array_elements(p) x;
  return coalesce((select jsonb_agg(jsonb_build_object('min_jars', r.min_jars, 'percent', r.percent) order by r.min_jars)
                   from public.promotions r), '[]'::jsonb);
end;
$$;

create function public.admin_set_order_status(p_id bigint, p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_require();
  if p_status not in ('new', 'confirmed', 'shipped', 'cancelled') then raise exception 'bad_status' using errcode = '22023'; end if;
  update public.orders set status = p_status where id = p_id;
  if not found then raise exception 'order_not_found' using errcode = '22023'; end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- who may call what
-- Supabase lets every role call a new function; take that back, then give each function to those who need it.

revoke execute on function
  public.is_admin(), public.handle_new_user(), public.get_site(), public.place_order(jsonb, text, text),
  public.get_my_account(), public.save_my_profile(text, text), public.admin_require(), public.admin_get_dashboard(),
  public.admin_save_settings(jsonb), public.admin_save_product(jsonb), public.admin_delete_product(bigint),
  public.admin_save_promotions(jsonb), public.admin_set_order_status(bigint, text)
from public, anon, authenticated;

grant execute on function public.get_site(), public.place_order(jsonb, text, text), public.is_admin() to anon, authenticated;
grant execute on function
  public.get_my_account(), public.save_my_profile(text, text), public.admin_require(), public.admin_get_dashboard(),
  public.admin_save_settings(jsonb), public.admin_save_product(jsonb), public.admin_delete_product(bigint),
  public.admin_save_promotions(jsonb), public.admin_set_order_status(bigint, text)
to authenticated;

-- nobody writes a table directly, whatever the default grants say
revoke insert, update, delete, truncate on
  public.site_settings, public.products, public.promotions, public.profiles, public.orders
from anon, authenticated;

-- ---------------------------------------------------------------- product photographs

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "admin adds product images" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.is_admin()));
create policy "admin lists product images" on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));
create policy "admin removes product images" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));

-- ---------------------------------------------------------------- what the page starts with

insert into public.site_settings (id) values (1);

insert into public.products (name, price, weight, ingredients, description, image_url, image_alt, sort) values
  ('น้ำพริกหนุ่ม',  89, '120 กรัม', 'พริกหนุ่มย่าง หอมแดง กระเทียม', 'เผ็ดอ่อน หอมกลิ่นพริกย่าง กินกับแคบหมูและผักลวก', 'assets/img/photo-f9375419-960.webp',  'น้ำพริกหนุ่มสีเขียวโรยผักชี ในถ้วยขอบแดง', 10),
  ('น้ำพริกแคบหมู', 99, '120 กรัม', 'ตำกับแคบหมูและพริกย่าง',       'เนื้อหยาบ ได้ความมันของแคบหมู กินกับข้าวเหนียว',   'assets/img/photo-f30500389-960.webp', 'น้ำพริกแคบหมูโรยต้นหอมและผักชี ในถ้วยขาว', 20),
  ('น้ำพริกนรก',   95, '100 กรัม', 'พริกแห้งกับปลาย่าง ตำแห้ง',     'เผ็ดจัด เนื้อแห้งร่วน โรยข้าวสวยร้อนได้เลย',       'assets/img/photo-f17060299-960.webp', 'น้ำพริกนรกในถ้วยเล็ก วางข้างข้าวผัดและหมูย่าง', 30),
  ('น้ำพริกเผา',   79, '150 กรัม', 'พริกแห้งคั่ว เคี่ยวจนข้น',      'เผ็ดกลาง ออกหวาน ทาขนมปังหรือใส่ต้มยำ',           'assets/img/photo-f10782378-960.webp', 'น้ำพริกสีแดงส้มกำลังผัดในกระทะ', 40);

insert into public.promotions (min_jars, percent) values (3, 10), (6, 15);

-- ---------------------------------------------------------------- the first admin
-- สมัครสมาชิกบนหน้าเว็บด้วยอีเมลของคุณก่อน แล้วรันบรรทัดนี้ใน SQL Editor (เปลี่ยนอีเมลเป็นของคุณ):
--   update public.profiles set role = 'admin' where email = 'you@example.com';
