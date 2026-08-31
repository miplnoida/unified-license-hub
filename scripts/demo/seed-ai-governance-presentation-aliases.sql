-- =====================================================================
-- AI Governance — customer/regulator-facing presentation aliases.
--
-- Vendor-neutral governance identities used on normal governance screens.
-- The true provider, gateway, technical model identifier and provider model
-- version remain unchanged in ai_governance_models, ai_governance_activity_attempts
-- and conduct_ai_insights, and stay visible to authorised technical/audit users.
--
-- Idempotent. Safe to re-run.
-- =====================================================================

INSERT INTO public.ai_governance_presentation_aliases (alias_kind, source_value, display_value, notes) VALUES
 ('SERVICE','lovable_ai_gateway','Managed AI Runtime (Platform-Governed)','Customer/regulator-facing service identity. Actual gateway retained in restricted technical provenance.'),
 ('MODEL','google/gemini-2.5-pro','Regulatory Analytical Model (Advanced)','Vendor-neutral governance identity for the advanced analytical model.'),
 ('MODEL','google/gemini-2.5-flash','Regulatory Analytical Model (Standard)','Vendor-neutral governance identity for the standard analytical model.'),
 ('MODEL','gemini-2.5-pro','Regulatory Analytical Model (Advanced)','Short-key variant.'),
 ('MODEL','gemini-2.5-flash','Regulatory Analytical Model (Standard)','Short-key variant.'),
 ('MODEL_VERSION','google/gemini-2.5-pro','2026.02-R1','Governance version label.'),
 ('MODEL_VERSION','google/gemini-2.5-flash','2026.02-R1','Governance version label.'),
 ('DISPLAY_NAME','Platform AI service — Gemini 2.5 Pro','Regulatory Analytical Model (Advanced)','Neutralises legacy register wording.'),
 ('DISPLAY_NAME','Platform AI service — Gemini 2.5 Flash','Regulatory Analytical Model (Standard)','Neutralises legacy register wording.')
ON CONFLICT (alias_kind, source_value) DO UPDATE
  SET display_value = EXCLUDED.display_value, notes = EXCLUDED.notes, updated_at = now();

-- Backfill governance labels on registered models without touching provenance.
UPDATE public.ai_governance_models m
   SET governance_display_name = COALESCE(m.governance_display_name,
         public.ai_gov_display_alias('MODEL', m.technical_identifier),
         public.ai_gov_display_alias('DISPLAY_NAME', m.display_name)),
       governance_version_label = COALESCE(m.governance_version_label,
         public.ai_gov_display_alias('MODEL_VERSION', m.technical_identifier)),
       updated_at = now()
 WHERE m.governance_display_name IS NULL OR m.governance_version_label IS NULL;
