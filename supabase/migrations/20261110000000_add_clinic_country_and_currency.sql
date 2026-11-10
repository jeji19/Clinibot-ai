alter table public.clinic_settings
  add column if not exists country_code text,
  add column if not exists currency_code text;

alter table public.clinic_settings
  add constraint clinic_settings_country_code_format
    check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  add constraint clinic_settings_currency_code_format
    check (currency_code is null or currency_code ~ '^[A-Z]{3}$');
