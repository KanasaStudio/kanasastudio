-- Run ONCE in the Supabase SQL editor (NOT a migration). There is no public admin sign-up.
-- 1) Dashboard > Authentication > Users > "Add user" (email + password, tick auto-confirm).
-- 2) Dashboard > Authentication > Providers > Email: turn OFF "Allow new users to sign up".
-- 3) Replace the email below and run:
insert into public.user_roles (user_id, role)
select id, 'owner' from auth.users where email = 'YOUR-ADMIN-EMAIL@example.com'
on conflict (user_id) do update set role = 'owner';
