create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;

create table public.vehicles (
  id bigint generated always as identity primary key,
  slug text not null unique,
  brand text not null,
  model text not null,
  family text not null,
  condition text not null check (condition in ('nueva', 'km0', 'ocasion')),
  condition_label text not null,
  price numeric(10,2) check (price is null or price >= 0),
  year smallint not null check (year between 1950 and 2100),
  km integer not null default 0 check (km >= 0),
  categories text[] not null default '{}',
  description text not null,
  image_path text not null,
  image_alt text not null,
  theme text not null default 'card-white',
  specs jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'available', 'reserved', 'sold')),
  featured_position smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vehicle_images (
  id bigint generated always as identity primary key,
  vehicle_id bigint not null references public.vehicles(id) on delete cascade,
  path text not null,
  alt_text text not null,
  position smallint not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  unique (vehicle_id, position)
);

create table public.leads (
  id bigint generated always as identity primary key,
  vehicle_slug text references public.vehicles(slug) on delete set null,
  customer_name text not null check (char_length(customer_name) between 2 and 120),
  phone text not null check (char_length(phone) between 6 and 32),
  email text not null check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  request_type text not null check (request_type in ('view', 'test_ride', 'finance', 'trade_in', 'other')),
  message text check (message is null or char_length(message) <= 2000),
  source text not null default 'website',
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'closed')),
  consent_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index vehicles_public_catalog_idx
  on public.vehicles (condition, featured_position nulls last, created_at desc)
  where status in ('available', 'reserved');
create index vehicles_categories_idx on public.vehicles using gin (categories);
create index vehicle_images_vehicle_id_idx on public.vehicle_images (vehicle_id, position);
create index leads_vehicle_slug_idx on public.leads (vehicle_slug);
create index leads_open_created_at_idx on public.leads (created_at desc)
  where status in ('new', 'contacted', 'qualified');

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger vehicles_set_updated_at
before update on public.vehicles
for each row execute function private.set_updated_at();

alter table public.vehicles enable row level security;
alter table public.vehicle_images enable row level security;
alter table public.leads enable row level security;

revoke all on public.vehicles, public.vehicle_images, public.leads from anon, authenticated;
grant select on public.vehicles, public.vehicle_images to anon, authenticated;
grant insert, update, delete on public.vehicles, public.vehicle_images to authenticated;
grant select, insert, update, delete on public.vehicles, public.vehicle_images, public.leads to service_role;
grant usage, select on sequence public.vehicles_id_seq, public.vehicle_images_id_seq, public.leads_id_seq to authenticated, service_role;

create policy vehicles_public_read
on public.vehicles for select
to anon, authenticated
using (status in ('available', 'reserved'));

create policy vehicles_admin_insert
on public.vehicles for insert
to authenticated
with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'inventory_admin');

create policy vehicles_admin_update
on public.vehicles for update
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'inventory_admin')
with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'inventory_admin');

create policy vehicles_admin_delete
on public.vehicles for delete
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'inventory_admin');

create policy vehicle_images_public_read
on public.vehicle_images for select
to anon, authenticated
using (
  exists (
    select 1 from public.vehicles
    where vehicles.id = vehicle_images.vehicle_id
      and vehicles.status in ('available', 'reserved')
  )
);

create policy vehicle_images_admin_insert
on public.vehicle_images for insert
to authenticated
with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'inventory_admin');

create policy vehicle_images_admin_update
on public.vehicle_images for update
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'inventory_admin')
with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'inventory_admin');

create policy vehicle_images_admin_delete
on public.vehicle_images for delete
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'inventory_admin');

insert into public.vehicles
  (slug, brand, model, family, condition, condition_label, price, year, km, categories, description, image_path, image_alt, theme, specs, status, featured_position)
values
  ('zontes-368k-2026', 'Zontes', '368K', 'Maxiscooter', 'ocasion', 'Ocasión · 2026', 4490, 2026, 2700, array['urbana','scooter','a2'], 'Maxiscooter tecnológico y cómodo para ciudad y carretera.', 'assets/motos/inventario/zontes-368k.jpg', 'Zontes 368K blanca expuesta en Pole Position', 'card-zontes', '{"Cilindrada":"368 cc","Kilometraje":"2.700 km","Año":"2026","Carné":"A2"}', 'available', 1),
  ('royal-enfield-hunter-350', 'Royal Enfield', 'Hunter 350', 'Roadster urbana', 'nueva', 'Gama nueva', null, 2026, 0, array['urbana','clasica','a2'], 'Una roadster ligera, accesible y con personalidad clásica.', 'assets/motos/inventario/royal-enfield-hunter-350.png', 'Royal Enfield Hunter 350 Dapper White en vista lateral', 'card-red', '{"Cilindrada":"349 cc","Potencia":"20,2 CV","Carné":"A2","Uso":"Ciudad y carretera"}', 'available', 2),
  ('suzuki-vstrom-1050de-2024', 'Suzuki', 'V-Strom 1050DE', 'Trail adventure', 'km0', 'KM0 · 2024', 13250, 2024, 0, array['trail','adventure'], 'Trail de gran cilindrada orientada a largos viajes y escapadas fuera del asfalto.', 'assets/motos/inventario/suzuki-vstrom-1050de.jpg', 'Suzuki V-Strom 1050DE azul y blanca en la exposición', 'card-sand', '{"Cilindrada":"1.037 cc","Kilometraje":"0 km","Año":"2024","Categoría":"Trail"}', 'available', 3),
  ('super-soco-f01', 'Super Soco', 'F01', 'Movilidad urbana', 'nueva', '100% eléctrica', 3000, 2026, 0, array['electrica','urbana'], 'Movilidad eléctrica silenciosa y práctica para desplazamientos urbanos.', 'assets/motos/inventario/super-soco-f01.jpg', 'Super Soco F01 eléctrica roja fotografiada en Pole Position', 'card-electric', '{"Autonomía":"Hasta 80 km","Carga":"Aprox. 3,5 h","Motor":"Eléctrico","Uso":"Urbano"}', 'available', 4),
  ('peugeot-xp400', 'Peugeot', 'XP400', 'Scooter premium', 'nueva', 'Gama nueva', null, 2026, 0, array['urbana','scooter','a2'], 'Scooter crossover de acabado premium, pensado para ciudad y carretera.', 'assets/motos/inventario/peugeot-xp400.jpg', 'Peugeot XP400 blanco en carretera', 'card-blue', '{"Cilindrada":"400 cc","Carné":"A2","Categoría":"Crossover","Uso":"Mixto"}', 'available', 5),
  ('suzuki-burgman-650-2018', 'Suzuki', 'Burgman 650', 'Gran turismo scooter', 'ocasion', 'Ocasión · 2018', 5250, 2018, 77000, array['urbana','scooter'], 'Maxiscooter Gran Turismo con gran protección y confort.', 'assets/motos/inventario/suzuki-burgman-650.jpg', 'Suzuki Burgman 650 blanca de ocasión en la exposición', 'card-white', '{"Cilindrada":"638 cc","Kilometraje":"77.000 km","Año":"2018","Categoría":"Maxiscooter"}', 'available', 6),
  ('kawasaki-z900-2020', 'Kawasaki', 'Z900', 'Naked deportiva', 'ocasion', 'Ocasión · 2020', 6450, 2020, 20600, array['urbana','naked','deportiva'], 'Naked de cuatro cilindros con respuesta deportiva y conducción directa.', 'assets/motos/inventario/kawasaki-z900.jfif', 'Kawasaki Z900 de ocasión fotografiada en Pole Position', 'card-green', '{"Potencia":"125 CV","Kilometraje":"20.600 km","Año":"2020","Categoría":"Naked"}', 'available', 7);

notify pgrst, 'reload schema';
