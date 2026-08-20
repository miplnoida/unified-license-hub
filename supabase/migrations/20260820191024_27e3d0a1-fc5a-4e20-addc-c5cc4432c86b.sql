UPDATE public.licensees
   SET regulator_officer_id = '563ad6fb-8b54-443f-8b5d-cd1c8200eb6e'
 WHERE name IN ('Atlantic Commercial Bank Ltd',
                'Nevis Investment Management Ltd',
                'Federation Credit Finance Ltd')
   AND regulator_officer_id IS NULL
   AND COALESCE(lead_regulator_id::text,'') <> '563ad6fb-8b54-443f-8b5d-cd1c8200eb6e'
   AND COALESCE(alternate_regulator_id::text,'') <> '563ad6fb-8b54-443f-8b5d-cd1c8200eb6e';