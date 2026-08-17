DROP POLICY IF EXISTS conduct_cfg_read ON public.conduct_risk_categories;
DROP POLICY IF EXISTS conduct_cfg_read ON public.conduct_products;
DROP POLICY IF EXISTS conduct_cfg_read ON public.conduct_channels;

CREATE POLICY conduct_cfg_read ON public.conduct_risk_categories
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'market_conduct', 'view')
  OR public.has_permission(auth.uid(), 'market_conduct', 'manage_complaints')
  OR public.has_permission(auth.uid(), 'complaint_management', 'view')
  OR public.has_permission(auth.uid(), 'complaint_management', 'create')
);

CREATE POLICY conduct_cfg_read ON public.conduct_products
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'market_conduct', 'view')
  OR public.has_permission(auth.uid(), 'market_conduct', 'manage_complaints')
  OR public.has_permission(auth.uid(), 'complaint_management', 'view')
  OR public.has_permission(auth.uid(), 'complaint_management', 'create')
);

CREATE POLICY conduct_cfg_read ON public.conduct_channels
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'market_conduct', 'view')
  OR public.has_permission(auth.uid(), 'market_conduct', 'manage_complaints')
  OR public.has_permission(auth.uid(), 'complaint_management', 'view')
  OR public.has_permission(auth.uid(), 'complaint_management', 'create')
);