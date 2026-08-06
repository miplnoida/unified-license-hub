-- ---------------------------------------------------------------
-- Member ratio roll-up
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.group_member_ratios(_group_id uuid, _period_key text)
RETURNS TABLE(licensee_id uuid, ratio_key text, label text, display_format text, value numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (m.licensee_id, r.ratio_key)
         m.licensee_id, r.ratio_key, r.label, r.display_format, r.value
  FROM public.financial_group_members m
  JOIN public.returns_filed rf ON rf.entity_id = m.licensee_id
   AND rf.return_year = NULLIF(split_part(_period_key,'-',1),'')::int
   AND rf.return_period = split_part(_period_key,'-',2)
  JOIN public.return_calculated_ratios r ON r.return_id = rf.id
  WHERE m.group_id = _group_id
    AND m.consolidation_treatment <> 'excluded'
    AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
  ORDER BY m.licensee_id, r.ratio_key, r.computed_at DESC;
$$;

-- ---------------------------------------------------------------
-- Intra-group exposure matrix + large / circular detection
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.intragroup_exposure_matrix(_group_id uuid, _period_key text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_method public.group_consolidation_methods;
  v_pct numeric := 10;
  v_capital numeric;
  v_basis text := 'group_total_exposure';
  v_threshold numeric;
  v_total numeric := 0;
  v_cells jsonb := '[]'::jsonb;
  v_by_type jsonb := '{}'::jsonb;
  v_large jsonb := '[]'::jsonb;
  v_cycles jsonb := '[]'::jsonb;
  v_entities jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_method FROM public.group_consolidation_methods
   WHERE group_id = _group_id AND is_active ORDER BY version DESC LIMIT 1;
  IF v_method.id IS NOT NULL THEN v_pct := COALESCE(v_method.large_exposure_pct, 10); END IF;

  SELECT jsonb_agg(jsonb_build_object('entity_id', l.id, 'name', l.name) ORDER BY l.name)
    INTO v_entities
  FROM public.financial_group_members m JOIN public.licensees l ON l.id = m.licensee_id
  WHERE m.group_id = _group_id;
  v_entities := COALESCE(v_entities, '[]'::jsonb);

  SELECT COALESCE(SUM(amount),0) INTO v_total FROM public.intragroup_exposures
   WHERE group_id = _group_id AND period_key = _period_key;

  -- Group capital basis (only when a capital ratio key is configured and present)
  IF v_method.capital_ratio_key IS NOT NULL THEN
    SELECT SUM(value) INTO v_capital FROM public.group_member_ratios(_group_id, _period_key)
     WHERE ratio_key = v_method.capital_ratio_key AND value IS NOT NULL;
    IF v_capital IS NOT NULL AND v_capital > 0 THEN v_basis := 'group_capital'; END IF;
  END IF;

  v_threshold := (v_pct / 100.0) * COALESCE(NULLIF(v_capital,0), v_total);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'from_entity_id', e.from_entity_id, 'to_entity_id', e.to_entity_id,
           'amount', e.amount, 'types', e.types, 'is_large', e.amount >= v_threshold AND v_threshold > 0)), '[]'::jsonb)
    INTO v_cells
  FROM (
    SELECT from_entity_id, to_entity_id, SUM(amount) AS amount,
           jsonb_object_agg(exposure_type, t_amount) AS types
    FROM (
      SELECT from_entity_id, to_entity_id, exposure_type, SUM(amount) AS t_amount, SUM(amount) AS amount
      FROM public.intragroup_exposures
      WHERE group_id = _group_id AND period_key = _period_key
      GROUP BY 1,2,3
    ) s GROUP BY 1,2
  ) e;

  SELECT COALESCE(jsonb_object_agg(exposure_type, total), '{}'::jsonb) INTO v_by_type
  FROM (SELECT exposure_type, SUM(amount) AS total FROM public.intragroup_exposures
        WHERE group_id = _group_id AND period_key = _period_key GROUP BY 1) t;

  SELECT COALESCE(jsonb_agg(c), '[]'::jsonb) INTO v_large
  FROM jsonb_array_elements(v_cells) c WHERE (c->>'is_large')::boolean;

  -- Circular chain detection
  WITH RECURSIVE edges AS (
    SELECT DISTINCT from_entity_id AS f, to_entity_id AS t
    FROM public.intragroup_exposures
    WHERE group_id = _group_id AND period_key = _period_key AND amount > 0
  ), paths(start_id, current_id, path, len) AS (
    SELECT f, t, ARRAY[f,t], 1 FROM edges
    UNION ALL
    SELECT p.start_id, e.t, p.path || e.t, p.len + 1
    FROM paths p JOIN edges e ON e.f = p.current_id
    WHERE p.len < 6 AND NOT (e.t = ANY (p.path[2:array_length(p.path,1)]))
  )
  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('chain', to_jsonb(path), 'length', len)), '[]'::jsonb)
    INTO v_cycles
  FROM paths WHERE current_id = start_id AND len > 1;

  RETURN jsonb_build_object(
    'entities', v_entities,
    'cells', v_cells,
    'by_type', v_by_type,
    'total', v_total,
    'large_exposure_pct', v_pct,
    'large_exposure_threshold', v_threshold,
    'large_exposure_basis', v_basis,
    'large_exposures', v_large,
    'circular_chains', v_cycles
  );
END;
$$;

-- ---------------------------------------------------------------
-- Recompute consolidated snapshot + group score + EWIs
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.group_consolidated_recompute(_group_id uuid, _period_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_method public.group_consolidation_methods;
  v_matrix jsonb;
  v_ratios jsonb := '[]'::jsonb;
  v_elim jsonb;
  v_elim_total numeric := 0;
  v_members int := 0;
  v_base numeric;
  v_uplift numeric := 0;
  v_score numeric;
  v_band text;
  v_components jsonb;
  v_large int := 0;
  v_circ int := 0;
  v_high int := 0;
BEGIN
  IF NOT public.can_manage_financial_group(auth.uid()) THEN
    RAISE EXCEPTION 'not authorised to recompute group consolidation';
  END IF;

  SELECT * INTO v_method FROM public.group_consolidation_methods
   WHERE group_id = _group_id AND is_active ORDER BY version DESC LIMIT 1;

  SELECT COUNT(*) INTO v_members FROM public.financial_group_members
   WHERE group_id = _group_id AND consolidation_treatment <> 'excluded';

  v_matrix := public.intragroup_exposure_matrix(_group_id, _period_key);
  v_large := jsonb_array_length(v_matrix->'large_exposures');
  v_circ := jsonb_array_length(v_matrix->'circular_chains');

  -- eliminations restricted to configured exposure types
  SELECT COALESCE(SUM(amount),0) INTO v_elim_total
  FROM public.intragroup_exposures
  WHERE group_id = _group_id AND period_key = _period_key
    AND exposure_type = ANY (COALESCE(v_method.eliminate_exposure_types, ARRAY['loan','deposit','capital']::text[]));

  SELECT jsonb_build_object(
           'total', v_elim_total,
           'types', COALESCE(v_method.eliminate_exposure_types, ARRAY['loan','deposit','capital']::text[]),
           'by_type', COALESCE(v_matrix->'by_type', '{}'::jsonb))
    INTO v_elim;

  -- consolidated ratios
  WITH mr AS (
    SELECT r.*, m.consolidation_treatment, COALESCE(m.ownership_percentage, 100) AS own_pct
    FROM public.group_member_ratios(_group_id, _period_key) r
    JOIN public.financial_group_members m
      ON m.licensee_id = r.licensee_id AND m.group_id = _group_id
  ), rules AS (
    SELECT (x->>'ratio_key') AS ratio_key, COALESCE(x->>'method','') AS method,
           COALESCE((x->>'eliminate')::boolean, false) AS eliminate
    FROM jsonb_array_elements(COALESCE(v_method.ratio_rules, '[]'::jsonb)) x
  ), agg AS (
    SELECT mr.ratio_key,
           MAX(mr.label) AS label,
           MAX(mr.display_format) AS display_format,
           COUNT(mr.value) AS contributors,
           SUM(mr.value * CASE WHEN mr.consolidation_treatment = 'proportional' THEN mr.own_pct/100.0 ELSE 1 END) AS sum_value,
           CASE WHEN SUM(CASE WHEN mr.value IS NULL THEN 0 ELSE mr.own_pct END) > 0
                THEN SUM(COALESCE(mr.value,0) * mr.own_pct) / SUM(CASE WHEN mr.value IS NULL THEN 0 ELSE mr.own_pct END)
                ELSE NULL END AS wavg_value,
           COALESCE(MAX(ru.method), '') AS rule_method,
           COALESCE(BOOL_OR(ru.eliminate), false) AS rule_eliminate
    FROM mr LEFT JOIN rules ru ON ru.ratio_key = mr.ratio_key
    GROUP BY mr.ratio_key
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ratio_key', ratio_key,
    'label', COALESCE(label, ratio_key),
    'display_format', display_format,
    'method', eff_method,
    'contributors', contributors,
    'gross_value', gross,
    'eliminated', CASE WHEN rule_eliminate THEN v_elim_total ELSE 0 END,
    'value', CASE WHEN rule_eliminate AND gross IS NOT NULL THEN gross - v_elim_total ELSE gross END
  ) ORDER BY ratio_key), '[]'::jsonb) INTO v_ratios
  FROM (
    SELECT a.*,
      CASE WHEN a.rule_method <> '' THEN a.rule_method
           WHEN a.display_format IN ('percent','ratio') THEN 'weighted_avg'
           ELSE 'sum' END AS eff_method,
      CASE WHEN (CASE WHEN a.rule_method <> '' THEN a.rule_method
                      WHEN a.display_format IN ('percent','ratio') THEN 'weighted_avg'
                      ELSE 'sum' END) = 'sum'
           THEN a.sum_value ELSE a.wavg_value END AS gross
    FROM agg a
  ) z;

  INSERT INTO public.group_consolidated_snapshots (group_id, period_key, ratios, eliminations, member_count, methodology_version, computed_at, computed_by)
  VALUES (_group_id, _period_key, v_ratios, v_elim, v_members, v_method.version, now(), auth.uid())
  ON CONFLICT (group_id, period_key) DO UPDATE
    SET ratios = EXCLUDED.ratios, eliminations = EXCLUDED.eliminations,
        member_count = EXCLUDED.member_count, methodology_version = EXCLUDED.methodology_version,
        computed_at = now(), computed_by = auth.uid();

  -- group score from member risk scores
  SELECT AVG(s.score) INTO v_base
  FROM public.financial_group_members m
  JOIN public.entity_risk_scores s ON s.entity_id = m.licensee_id AND s.is_current
  WHERE m.group_id = _group_id AND m.consolidation_treatment <> 'excluded';

  SELECT COUNT(*) INTO v_high
  FROM public.financial_group_members m
  JOIN public.entity_risk_scores s ON s.entity_id = m.licensee_id AND s.is_current
  WHERE m.group_id = _group_id AND s.band IN ('high','critical');

  v_uplift := LEAST(15, 5 * v_large + CASE WHEN v_circ > 0 THEN 10 ELSE 0 END);
  v_score := LEAST(100, ROUND(COALESCE(v_base, 0) + v_uplift, 2));
  v_band := CASE WHEN v_score >= 75 THEN 'critical' WHEN v_score >= 50 THEN 'high'
                 WHEN v_score >= 25 THEN 'medium' ELSE 'low' END;

  v_components := jsonb_build_object(
    'member_score_average', v_base,
    'members_scored', (SELECT COUNT(*) FROM public.financial_group_members m
                        JOIN public.entity_risk_scores s ON s.entity_id = m.licensee_id AND s.is_current
                       WHERE m.group_id = _group_id),
    'members_total', v_members,
    'members_high_or_critical', v_high,
    'large_exposures', v_large,
    'circular_chains', v_circ,
    'contagion_uplift', v_uplift,
    'base_available', v_base IS NOT NULL
  );

  INSERT INTO public.group_risk_scores (group_id, period_key, score, band, components, is_current, computed_at, computed_by)
  VALUES (_group_id, _period_key, v_score, v_band, v_components, true, now(), auth.uid())
  ON CONFLICT (group_id, period_key) DO UPDATE
    SET score = EXCLUDED.score, band = EXCLUDED.band, components = EXCLUDED.components,
        is_current = true, computed_at = now(), computed_by = auth.uid();

  UPDATE public.group_risk_scores SET is_current = false
   WHERE group_id = _group_id AND period_key <> _period_key AND is_current;

  PERFORM public.group_ewi_evaluate(_group_id, _period_key);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
  VALUES (auth.uid(), 'GROUP_CONSOLIDATED_RECOMPUTED', 'financial_group', _group_id::text,
          jsonb_build_object('period_key', _period_key, 'score', v_score, 'band', v_band));

  RETURN jsonb_build_object('ok', true, 'period_key', _period_key, 'ratios', v_ratios,
                            'eliminations', v_elim, 'score', v_score, 'band', v_band,
                            'components', v_components, 'matrix', v_matrix);
END;
$$;

-- ---------------------------------------------------------------
-- Group EWI evaluation
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.group_ewi_evaluate(_group_id uuid, _period_key text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.group_ewi_rules;
  v_fired int := 0;
  v_high int := 0;
  v_matrix jsonb;
  v_period text := COALESCE(_period_key, (SELECT period_key FROM public.group_risk_scores WHERE group_id = _group_id ORDER BY computed_at DESC LIMIT 1));
  v_hit boolean;
  v_details jsonb;
BEGIN
  FOR r IN SELECT * FROM public.group_ewi_rules WHERE is_active LOOP
    v_hit := false; v_details := '{}'::jsonb;

    IF r.condition->>'type' = 'member_band_count' THEN
      SELECT COUNT(*) INTO v_high
      FROM public.financial_group_members m
      JOIN public.entity_risk_scores s ON s.entity_id = m.licensee_id AND s.is_current
      WHERE m.group_id = _group_id
        AND s.band = ANY (ARRAY(SELECT jsonb_array_elements_text(r.condition->'band_in')));
      IF v_high >= COALESCE((r.condition->>'min_count')::int, 2) THEN
        v_hit := true;
        v_details := jsonb_build_object('members_matching', v_high);
      END IF;

    ELSIF r.condition->>'type' IN ('large_exposure','circular_exposure') THEN
      IF v_period IS NOT NULL THEN
        v_matrix := public.intragroup_exposure_matrix(_group_id, v_period);
        IF r.condition->>'type' = 'large_exposure' AND jsonb_array_length(v_matrix->'large_exposures') > 0 THEN
          v_hit := true;
          v_details := jsonb_build_object('count', jsonb_array_length(v_matrix->'large_exposures'),
                                          'threshold', v_matrix->'large_exposure_threshold',
                                          'basis', v_matrix->'large_exposure_basis');
        ELSIF r.condition->>'type' = 'circular_exposure' AND jsonb_array_length(v_matrix->'circular_chains') > 0 THEN
          v_hit := true;
          v_details := jsonb_build_object('chains', v_matrix->'circular_chains');
        END IF;
      END IF;
    END IF;

    IF v_hit THEN
      IF NOT EXISTS (SELECT 1 FROM public.group_ewi_alerts a
                      WHERE a.group_id = _group_id AND a.rule_code = r.code AND a.status = 'open') THEN
        INSERT INTO public.group_ewi_alerts (group_id, rule_code, rule_name, severity, details)
        VALUES (_group_id, r.code, r.name, r.severity, v_details || jsonb_build_object('period_key', v_period));
        v_fired := v_fired + 1;
        INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
        VALUES (auth.uid(), 'GROUP_EWI_FIRED', 'financial_group', _group_id::text,
                jsonb_build_object('rule_code', r.code, 'details', v_details));
      ELSE
        UPDATE public.group_ewi_alerts
           SET details = v_details || jsonb_build_object('period_key', v_period)
         WHERE group_id = _group_id AND rule_code = r.code AND status = 'open';
      END IF;
    ELSE
      UPDATE public.group_ewi_alerts SET status = 'closed'
       WHERE group_id = _group_id AND rule_code = r.code AND status = 'open';
    END IF;
  END LOOP;

  RETURN v_fired;
END;
$$;

-- Re-evaluate group EWIs when a member's risk score changes (R-PRU-025)
CREATE OR REPLACE FUNCTION public.trg_group_ewi_on_member_score()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g uuid;
BEGIN
  FOR g IN SELECT DISTINCT group_id FROM public.financial_group_members WHERE licensee_id = NEW.entity_id LOOP
    PERFORM public.group_ewi_evaluate(g, NULL);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ers_group_ewi ON public.entity_risk_scores;
CREATE TRIGGER trg_ers_group_ewi
AFTER INSERT OR UPDATE OF score, band ON public.entity_risk_scores
FOR EACH ROW EXECUTE FUNCTION public.trg_group_ewi_on_member_score();

-- ---------------------------------------------------------------
-- Consolidated read payload
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prudential_group_consolidated(_group_id uuid, _period_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_period text;
  v_group jsonb;
  v_members jsonb;
  v_snapshot jsonb;
  v_score jsonb;
  v_alerts jsonb;
  v_heatmap jsonb;
  v_breaches jsonb;
  v_method jsonb;
BEGIN
  IF NOT public.can_read_financial_group(auth.uid(), _group_id) THEN
    RAISE EXCEPTION 'not authorised to view this financial group';
  END IF;

  v_period := COALESCE(_period_key,
    (SELECT rf.return_year || '-' || rf.return_period
       FROM public.financial_group_members m
       JOIN public.returns_filed rf ON rf.entity_id = m.licensee_id
      WHERE m.group_id = _group_id
      ORDER BY rf.period_end_date DESC LIMIT 1));

  SELECT to_jsonb(g) || jsonb_build_object('holding_entity_name', l.name)
    INTO v_group
  FROM public.financial_groups g
  LEFT JOIN public.licensees l ON l.id = g.holding_entity_id
  WHERE g.id = _group_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'member_id', m.id, 'licensee_id', m.licensee_id, 'name', l.name,
      'parent_member_id', m.parent_member_id, 'member_role', m.member_role,
      'ownership_percentage', m.ownership_percentage,
      'consolidation_treatment', m.consolidation_treatment,
      'effective_date', m.effective_date, 'end_date', m.end_date,
      'licensee_status', l.status, 'sector_id', l.sector_id,
      'sector_name', s.name,
      'systemic_importance', l.systemic_importance,
      'risk_score', rs.score, 'risk_band', rs.band
    ) ORDER BY CASE m.member_role WHEN 'ultimate_holding' THEN 0 ELSE 1 END, l.name), '[]'::jsonb)
    INTO v_members
  FROM public.financial_group_members m
  JOIN public.licensees l ON l.id = m.licensee_id
  LEFT JOIN public.sectors s ON s.id = l.sector_id
  LEFT JOIN public.entity_risk_scores rs ON rs.entity_id = m.licensee_id AND rs.is_current
  WHERE m.group_id = _group_id;

  SELECT to_jsonb(x) INTO v_snapshot FROM public.group_consolidated_snapshots x
   WHERE x.group_id = _group_id AND x.period_key = v_period;

  SELECT to_jsonb(x) INTO v_score FROM public.group_risk_scores x
   WHERE x.group_id = _group_id AND x.period_key = v_period;

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.fired_at DESC), '[]'::jsonb) INTO v_alerts
  FROM public.group_ewi_alerts a WHERE a.group_id = _group_id AND a.status <> 'closed';

  SELECT to_jsonb(x) INTO v_method FROM public.group_consolidation_methods x
   WHERE x.group_id = _group_id AND x.is_active ORDER BY x.version DESC LIMIT 1;

  -- CAMELS heatmap from latest approved / most recent assessment per member
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'licensee_id', t.licensee_id, 'name', t.name,
      'overall_rating', t.overall_rating, 'ratings', t.ratings,
      'assessed_at', t.updated_at) ORDER BY t.name), '[]'::jsonb)
    INTO v_heatmap
  FROM (
    SELECT DISTINCT ON (m.licensee_id) m.licensee_id, l.name, a.overall_rating, a.ratings, a.updated_at
    FROM public.financial_group_members m
    JOIN public.licensees l ON l.id = m.licensee_id
    LEFT JOIN public.prudential_assessments a ON a.entity_id = m.licensee_id
    WHERE m.group_id = _group_id
    ORDER BY m.licensee_id,
             CASE WHEN a.status IN ('approved','closed') THEN 0 ELSE 1 END,
             a.updated_at DESC NULLS LAST
  ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'licensee_id', m.licensee_id, 'name', l.name, 'metric_key', b.metric_key,
      'risk_level', b.risk_level, 'level', b.level, 'value', b.value,
      'threshold_value', b.threshold_value, 'comparator', b.comparator,
      'detected_at', b.detected_at, 'return_id', b.return_id,
      'period', rf.return_year || '-' || rf.return_period) ORDER BY b.detected_at DESC), '[]'::jsonb)
    INTO v_breaches
  FROM public.financial_group_members m
  JOIN public.licensees l ON l.id = m.licensee_id
  JOIN public.returns_filed rf ON rf.entity_id = m.licensee_id
  JOIN public.return_threshold_breaches b ON b.return_id = rf.id
  WHERE m.group_id = _group_id
    AND (v_period IS NULL OR rf.return_year || '-' || rf.return_period = v_period);

  RETURN jsonb_build_object(
    'group', v_group,
    'period_key', v_period,
    'members', v_members,
    'methodology', v_method,
    'snapshot', v_snapshot,
    'score', v_score,
    'alerts', v_alerts,
    'heatmap', v_heatmap,
    'breaches', v_breaches,
    'matrix', public.intragroup_exposure_matrix(_group_id, v_period)
  );
END;
$$;

-- ---------------------------------------------------------------
-- Entity → group membership lookup (for the entity profile tab)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.licensee_group_membership(_licensee_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_gid uuid; v_row jsonb;
BEGIN
  SELECT group_id INTO v_gid FROM public.financial_group_members WHERE licensee_id = _licensee_id LIMIT 1;
  IF v_gid IS NULL THEN RETURN jsonb_build_object('is_member', false); END IF;
  IF NOT public.can_read_financial_group(auth.uid(), v_gid) THEN
    RETURN jsonb_build_object('is_member', true, 'authorised', false, 'group_id', v_gid);
  END IF;
  SELECT jsonb_build_object(
      'is_member', true, 'authorised', true, 'group_id', v_gid,
      'group_code', g.group_code, 'group_name', g.name,
      'member_role', m.member_role, 'ownership_percentage', m.ownership_percentage,
      'consolidation_treatment', m.consolidation_treatment)
    INTO v_row
  FROM public.financial_group_members m JOIN public.financial_groups g ON g.id = m.group_id
  WHERE m.licensee_id = _licensee_id AND m.group_id = v_gid;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.group_member_ratios(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.intragroup_exposure_matrix(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.group_consolidated_recompute(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.group_ewi_evaluate(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.prudential_group_consolidated(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.licensee_group_membership(uuid) FROM anon;