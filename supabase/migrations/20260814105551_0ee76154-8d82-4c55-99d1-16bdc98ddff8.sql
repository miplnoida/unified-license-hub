UPDATE registration_form_configs
SET form_schema = jsonb_set(
  form_schema,
  '{0,rows}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN row_data->>'id' = 's1r6' THEN
          jsonb_set(row_data, '{columns}', '[{"span":6,"field":{"fieldName":"mailing_country","id":"87438824-3731-4a32-bb22-27a3bd5514e2","label":"Country","masterDataTypeCode":"COUNTRY","optionSource":"master_data","placeholder":"Select Country","required":true,"type":"select"}},{"span":6,"field":{"fieldName":"mailing_state","id":"5c3c7f4a-03bd-4e12-83ad-60a6bf3465b3","label":"State/Parish/Province/Region","masterDataParentField":"mailing_country","masterDataTypeCode":"STATE","optionSource":"master_data","placeholder":"Select State/Province","required":false,"type":"select"}}]'::jsonb)
        WHEN row_data->>'id' = 's1r7' THEN
          jsonb_set(row_data, '{columns}', '[{"span":6,"field":{"fieldName":"mailing_city","id":"6baab7f5-be34-4346-89dd-a7f8cffad9d9","label":"City or Town","masterDataParentField":"mailing_state","masterDataTypeCode":"CITY","optionSource":"master_data","placeholder":"Select City/Town","required":true,"type":"select"}},{"span":6,"field":{"fieldName":"mailing_postcode","id":"cf7817fd-4b1a-4ab5-b6bb-293e72f95d46","label":"Post Code","required":true,"type":"text"}}]'::jsonb)
        WHEN row_data->>'id' = 's1r11' THEN
          jsonb_set(row_data, '{columns}', '[{"span":6,"field":{"fieldName":"physical_country","id":"6a1547a9-1217-47ae-8dac-ef41e32fe227","label":"Country","masterDataTypeCode":"COUNTRY","optionSource":"master_data","placeholder":"Select Country","required":false,"type":"select"}},{"span":6,"field":{"fieldName":"physical_state","id":"c3571a83-0118-4862-adf3-c18ae0e52b7e","label":"State/Parish/Province/Region","masterDataParentField":"physical_country","masterDataTypeCode":"STATE","optionSource":"master_data","placeholder":"Select State/Province","required":false,"type":"select"}}]'::jsonb)
        WHEN row_data->>'id' = 's1r12' THEN
          jsonb_set(row_data, '{columns}', '[{"span":6,"field":{"fieldName":"physical_city","id":"dc9060c3-9e9d-4a33-bba7-cfd585a2eaa0","label":"City or Town","masterDataParentField":"physical_state","masterDataTypeCode":"CITY","optionSource":"master_data","placeholder":"Select City/Town","required":false,"type":"select"}},{"span":6,"field":{"fieldName":"physical_postcode","id":"d84737a2-e5a2-4b97-b49e-d56e65c11e3d","label":"Post Code","required":false,"type":"text"}}]'::jsonb)
        ELSE row_data
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(form_schema->0->'rows') WITH ORDINALITY AS t(row_data, ord)
  )
)
WHERE is_default = true AND is_active = true;