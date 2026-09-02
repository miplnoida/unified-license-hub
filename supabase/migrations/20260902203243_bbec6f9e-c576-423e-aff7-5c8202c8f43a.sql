INSERT INTO public.supervisory_rating_scale(code, label, ordinal, band, is_active)
VALUES ('STRONG','Strong',11,'CONTROL',true),
       ('SATISFACTORY','Satisfactory',12,'CONTROL',true),
       ('NEEDS_IMPROVEMENT','Needs improvement',13,'CONTROL',true),
       ('WEAK','Weak',14,'CONTROL',true)
ON CONFLICT (code) DO UPDATE SET is_active = true, band = EXCLUDED.band;