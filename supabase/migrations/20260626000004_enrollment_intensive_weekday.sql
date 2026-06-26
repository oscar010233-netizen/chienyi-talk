alter table class_enrollments
  add column if not exists intensive_preferred_weekday smallint
    check (intensive_preferred_weekday between 1 and 7);
