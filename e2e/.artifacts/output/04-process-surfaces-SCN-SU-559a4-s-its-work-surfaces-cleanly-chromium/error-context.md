# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 04-process-surfaces.spec.ts >> SCN-SURFACE-P08-CONDUCT: owning persona opens its work surfaces cleanly
- Location: e2e/cert-v2/04-process-surfaces.spec.ts:29:3

# Error details

```
Error: P08-CONDUCT surface defects

expect(received).toEqual(expected) // deep equality

- Expected  -   1
+ Received  + 390

- Array []
+ Array [
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s  
+     at App",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at QueryClientProvider (http://localhost:8080/node_modules/.vite/",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at SiteSettingsProvider (http://localhost:8080/src/contexts/SiteS",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at AuthProvider (http://localhost:8080/src/contexts/AuthContext.t",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at NotificationsProvider (http://localhost:8080/src/contexts/Noti",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at RegulatorProvider (http://localhost:8080/src/contexts/Regulato",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at PpocProvider (http://localhost:8080/src/contexts/PpocContext.t",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at ActiveSectorProvider (http://localhost:8080/src/contexts/Activ",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at TooltipProvider (http://localhost:8080/node_modules/.vite/deps",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at Toaster (http://localhost:8080/src/components/ui/toaster.tsx:2",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `Toaster`. 
+     at ToastProvider (http://localhost:8080/node_modules/.vite/de",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at Toaster (http://localhost:8080/src/components/ui/sonner.tsx:24",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/r",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at AppRoutes
+     at Router (http://localhost:8080/node_modules/.v",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppRoutes`. 
+     at Routes (http://localhost:8080/node_modules/.vite/deps/re",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppRoutes`. 
+     at AppShell (http://localhost:8080/src/components/layout/Ap",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at BreadcrumbLabelProvider (http://localhost:8080/src/compon",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at Sidebar (http://localhost:8080/src/components/layout/Side",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at Header (http://localhost:8080/src/components/layout/Heade",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `Header`. 
+     at GlobalNavSearch (http://localhost:8080/src/components/layou",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `GlobalNavSearch`. 
+     at CommandDialog (http://localhost:8080/src/component",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `CommandDialog`. 
+     at Dialog (http://localhost:8080/node_modules/.vite/dep",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `DialogContent`. 
+     at DialogPortal (http://localhost:8080/node_modules/.vi",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `Header`. 
+     at HoverCard (http://localhost:8080/node_modules/.vite/deps/@r",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at LicenseeSwitcher (http://localhost:8080/src/components/pp",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at ApplicationBreadcrumbs (http://localhost:8080/src/compone",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `ApplicationBreadcrumbs`. 
+     at BreadcrumbSeparator (http://localhost:8080/",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at ActingOnBehalfOfBanner (http://localhost:8080/src/compone",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at RouteContentTransition (http://localhost:8080/src/compone",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at Outlet (http://localhost:8080/node_modules/.vite/deps/rea",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s  
+     at M (http://localhost:8080/src/routes/dashboardRoutes.tsx:264:14)
+     at RenderedRoute (http://loca",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `M`. 
+     at P (http://localhost:8080/src/routes/routeHelpers.tsx:217:87)
+    ",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `P`. 
+     at ProtectedRoute (http://localhost:8080/src/routes/routeHelpers.ts",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `ProtectedRoute`. 
+     at AuthLoadingScreen
+     at ProtectedRoute (http://loc",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AuthLoadingScreen`. 
+     at Skeleton (http://localhost:8080/src/components/u",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AuthLoadingScreen`. 
+     at Skeleton (http://localhost:8080/src/components/u",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AuthLoadingScreen`. 
+     at Skeleton (http://localhost:8080/src/components/u",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AuthLoadingScreen`. 
+     at Skeleton (http://localhost:8080/src/components/u",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AuthLoadingScreen`. 
+     at Skeleton (http://localhost:8080/src/components/u",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `Header`. 
+     at DropdownMenu (http://localhost:8080/node_modules/.vite/deps",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `DropdownMenuContent`. 
+     at DropdownMenuPortal (http://localhost:8080/node",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `Sidebar`. 
+     at NavLeaf (http://localhost:8080/src/components/layout/Sideb",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `ModuleRoute`. 
+     at AuthLoadingScreen
+     at ModuleRoute (http://localhost",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `Sidebar`. 
+     at CollapsibleNavItem (http://localhost:8080/src/components/l",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `CollapsibleNavItem`. 
+     at NavLeaf (http://localhost:8080/src/components/l",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `CollapsibleNavItem`. 
+     at CollapsibleNavItem (http://localhost:8080/src/c",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `ModuleRoute`. 
+     at AccessDenied (http://localhost:8080/src/components/sha",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AccessDenied`. 
+     at DashboardLayout (http://localhost:8080/src/components",
+   "denied-ui /conduct/work-queue",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s  
+     at App",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at QueryClientProvider (http://localhost:8080/node_modules/.vite/",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at SiteSettingsProvider (http://localhost:8080/src/contexts/SiteS",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at AuthProvider (http://localhost:8080/src/contexts/AuthContext.t",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at NotificationsProvider (http://localhost:8080/src/contexts/Noti",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at RegulatorProvider (http://localhost:8080/src/contexts/Regulato",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at PpocProvider (http://localhost:8080/src/contexts/PpocContext.t",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at ActiveSectorProvider (http://localhost:8080/src/contexts/Activ",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at TooltipProvider (http://localhost:8080/node_modules/.vite/deps",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at Toaster (http://localhost:8080/src/components/ui/toaster.tsx:2",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `Toaster`. 
+     at ToastProvider (http://localhost:8080/node_modules/.vite/de",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at Toaster (http://localhost:8080/src/components/ui/sonner.tsx:24",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/r",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at AppRoutes
+     at Router (http://localhost:8080/node_modules/.v",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppRoutes`. 
+     at Routes (http://localhost:8080/node_modules/.vite/deps/re",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppRoutes`. 
+     at AppShell (http://localhost:8080/src/components/layout/Ap",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at BreadcrumbLabelProvider (http://localhost:8080/src/compon",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at Sidebar (http://localhost:8080/src/components/layout/Side",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at Header (http://localhost:8080/src/components/layout/Heade",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `Header`. 
+     at GlobalNavSearch (http://localhost:8080/src/components/layou",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `GlobalNavSearch`. 
+     at CommandDialog (http://localhost:8080/src/component",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `CommandDialog`. 
+     at Dialog (http://localhost:8080/node_modules/.vite/dep",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `DialogContent`. 
+     at DialogPortal (http://localhost:8080/node_modules/.vi",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `Header`. 
+     at HoverCard (http://localhost:8080/node_modules/.vite/deps/@r",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at LicenseeSwitcher (http://localhost:8080/src/components/pp",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at ApplicationBreadcrumbs (http://localhost:8080/src/compone",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `ApplicationBreadcrumbs`. 
+     at BreadcrumbSeparator (http://localhost:8080/",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at ActingOnBehalfOfBanner (http://localhost:8080/src/compone",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at RouteContentTransition (http://localhost:8080/src/compone",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at Outlet (http://localhost:8080/node_modules/.vite/deps/rea",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s  
+     at M (http://localhost:8080/src/routes/dashboardRoutes.tsx:264:14)
+     at RenderedRoute (http://loca",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `M`. 
+     at P (http://localhost:8080/src/routes/routeHelpers.tsx:217:87)
+    ",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `P`. 
+     at ProtectedRoute (http://localhost:8080/src/routes/routeHelpers.ts",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `ProtectedRoute`. 
+     at AuthLoadingScreen
+     at ProtectedRoute (http://loc",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AuthLoadingScreen`. 
+     at Skeleton (http://localhost:8080/src/components/u",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AuthLoadingScreen`. 
+     at Skeleton (http://localhost:8080/src/components/u",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AuthLoadingScreen`. 
+     at Skeleton (http://localhost:8080/src/components/u",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AuthLoadingScreen`. 
+     at Skeleton (http://localhost:8080/src/components/u",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AuthLoadingScreen`. 
+     at Skeleton (http://localhost:8080/src/components/u",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `Header`. 
+     at DropdownMenu (http://localhost:8080/node_modules/.vite/deps",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `DropdownMenuContent`. 
+     at DropdownMenuPortal (http://localhost:8080/node",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `Sidebar`. 
+     at NavLeaf (http://localhost:8080/src/components/layout/Sideb",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `ModuleRoute`. 
+     at AuthLoadingScreen
+     at ModuleRoute (http://localhost",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `Sidebar`. 
+     at CollapsibleNavItem (http://localhost:8080/src/components/l",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `CollapsibleNavItem`. 
+     at NavLeaf (http://localhost:8080/src/components/l",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `CollapsibleNavItem`. 
+     at CollapsibleNavItem (http://localhost:8080/src/c",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `ModuleRoute`. 
+     at AccessDenied (http://localhost:8080/src/components/sha",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AccessDenied`. 
+     at DashboardLayout (http://localhost:8080/src/components",
+   "denied-ui /conduct/alerts",
+ ]
```

# Page snapshot

```yaml
- generic [ref=f2e2]:
  - region "Notifications (F8)":
    - list
  - region "Notifications alt+T"
  - generic [ref=f2e3]:
    - complementary [ref=f2e4]:
      - generic [ref=f2e5]:
        - img "OLRAS" [ref=f2e7]
        - button [ref=f2e8] [cursor=pointer]
      - navigation [ref=f2e12]:
        - generic [ref=f2e14]:
          - generic [ref=f2e15]:
            - button "Home" [expanded] [ref=f2e16] [cursor=pointer]
            - link "Home" [ref=f2e27] [cursor=pointer]:
              - /url: /dashboard
          - generic [ref=f2e33]:
            - button "My Work" [ref=f2e34] [cursor=pointer]
            - generic [ref=f2e42]:
              - link "Notifications" [ref=f2e43] [cursor=pointer]:
                - /url: /notifications
              - link "My Licences" [ref=f2e49] [cursor=pointer]:
                - /url: /licenses
              - link "My Returns" [ref=f2e55] [cursor=pointer]:
                - /url: /entity/returns
              - link "My Appeals" [ref=f2e61] [cursor=pointer]:
                - /url: /appeals
              - link "My Correspondence" [ref=f2e70] [cursor=pointer]:
                - /url: /entity/correspondence
              - link "Information Requests" [ref=f2e76] [cursor=pointer]:
                - /url: /entity/complaint-rfis
              - link "Supervisory Actions" [ref=f2e81] [cursor=pointer]:
                - /url: /entity/supervisory-actions
              - link "My Payments" [ref=f2e87] [cursor=pointer]:
                - /url: /payments
          - generic [ref=f2e92]:
            - button "Licensing & Authorisation" [ref=f2e93] [cursor=pointer]
            - generic [ref=f2e102]:
              - button "Applications" [ref=f2e103] [cursor=pointer]
              - generic [ref=f2e112]:
                - link "Pre-Licensing" [ref=f2e113] [cursor=pointer]:
                  - /url: /applications?type=pre
                - link "Post-Licensing" [ref=f2e119] [cursor=pointer]:
                  - /url: /applications?type=post
          - generic [ref=f2e126]:
            - button "Supervision" [expanded] [ref=f2e127] [cursor=pointer]
            - generic [ref=f2e138]:
              - button "Market Conduct" [expanded] [ref=f2e139] [cursor=pointer]
              - link "Complaints" [ref=f2e154] [cursor=pointer]:
                - /url: /complaints
          - generic [ref=f2e159]:
            - button "Returns & Data" [ref=f2e160] [cursor=pointer]
            - link "Reporting Dashboard" [ref=f2e169] [cursor=pointer]:
              - /url: /entity/returns/dashboard
          - generic [ref=f2e177]:
            - button "Correspondence & Cases" [ref=f2e178] [cursor=pointer]
            - link "Documents" [ref=f2e187] [cursor=pointer]:
              - /url: /documents
    - generic [ref=f2e193]:
      - banner [ref=f2e194]:
        - button "Search navigation" [ref=f2e196] [cursor=pointer]:
          - generic [ref=f2e200]: Search...
          - generic [ref=f2e201]: ⌘K
        - generic [ref=f2e202]:
          - button "Notifications" [ref=f2e203] [cursor=pointer]
          - button "C Certification - Conduct Analyst Applicant" [ref=f2e204] [cursor=pointer]:
            - generic [ref=f2e205]: C
            - generic [ref=f2e207]:
              - paragraph [ref=f2e208]: Certification - Conduct Analyst
              - paragraph [ref=f2e209]: Applicant
      - main [ref=f2e210]:
        - generic [ref=f2e211]:
          - navigation "breadcrumb" [ref=f2e212]:
            - list [ref=f2e213]:
              - listitem [ref=f2e214]:
                - link "Home" [ref=f2e215] [cursor=pointer]:
                  - /url: /dashboard
              - listitem [ref=f2e216]
              - listitem [ref=f2e219]:
                - link "Market conduct" [ref=f2e220] [cursor=pointer]:
                  - /url: /conduct
              - listitem [ref=f2e221]
              - listitem [ref=f2e224]:
                - link "Conduct alerts" [disabled] [ref=f2e225]
          - generic [ref=f2e228]:
            - heading "Access Denied" [level=1] [ref=f2e232]
            - paragraph [ref=f2e233]: You don't have permission to access this page. Please contact your administrator if you believe this is an error.
            - link "Go to Dashboard" [ref=f2e234] [cursor=pointer]:
              - /url: /dashboard
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { PERSONAS } from './support/personas';
  3  | import { loginAs } from './support/auth';
  4  | 
  5  | /**
  6  |  * WAVE 3A / SCN-SURFACE — discovery pass over the process work surfaces each
  7  |  * internal persona owns. This test is a gap detector: it fails on server
  8  |  * rejections (4xx/5xx) or unhandled runtime errors raised while the owning
  9  |  * persona opens its own queue. Findings feed the Wave 3A gap register.
  10 |  */
  11 | 
  12 | interface Surface { code: string; persona: string; routes: string[] }
  13 | 
  14 | const SURFACES: Surface[] = [
  15 |   { code: 'P03-LICENSING', persona: PERSONAS.licensingOfficer, routes: ['/applications/queue', '/licensing/onboarding-oversight'] },
  16 |   { code: 'P04-LICENCE', persona: PERSONAS.licensingSupervisor, routes: ['/licenses', '/licenses/lifecycle'] },
  17 |   { code: 'P05-FITPROPER', persona: PERSONAS.fitProperOfficer, routes: ['/fpa', '/fpa/individuals'] },
  18 |   { code: 'P06-RETURNS', persona: PERSONAS.returnsOfficer, routes: ['/returns/queue', '/returns/obligations', '/returns/calendar'] },
  19 |   { code: 'P07-PRUDENTIAL', persona: PERSONAS.prudentialAnalyst, routes: ['/prudential/work', '/prudential/dashboard', '/supervision/early-warnings'] },
  20 |   { code: 'P08-CONDUCT', persona: PERSONAS.conductAnalyst, routes: ['/conduct/work-queue', '/conduct/alerts'] },
  21 |   { code: 'P09-COMPLAINTS', persona: PERSONAS.complaintsOfficer, routes: ['/complaints', '/complaints/escalations'] },
  22 |   { code: 'P10-INSPECTION', persona: PERSONAS.inspector, routes: ['/inspections', '/prudential/examinations'] },
  23 |   { code: 'P11-ENFORCEMENT', persona: PERSONAS.enforcementOfficer, routes: ['/enforcement'] },
  24 |   { code: 'P12-CORRESPONDENCE', persona: PERSONAS.superAdmin, routes: ['/correspondence/inbox', '/correspondence/threads'] },
  25 |   { code: 'P13-ENTITY-RES', persona: PERSONAS.entityResolutionOfficer, routes: ['/licensing/entity-resolution', '/entities'] },
  26 | ];
  27 | 
  28 | for (const s of SURFACES) {
  29 |   test(`SCN-SURFACE-${s.code}: owning persona opens its work surfaces cleanly`, async ({ page }) => {
  30 |     const failures: string[] = [];
  31 |     page.on('console', m => {
  32 |       if (m.type() === 'error') failures.push(`console: ${m.text().slice(0, 240)}`);
  33 |     });
  34 |     page.on('pageerror', e => failures.push(`pageerror: ${String(e.message).slice(0, 240)}`));
  35 |     page.on('response', r => {
  36 |       if (r.status() >= 400 && !r.url().includes('/auth/v1/')) {
  37 |         failures.push(`http ${r.status()} ${r.url().split('?')[0].slice(-90)}`);
  38 |       }
  39 |     });
  40 | 
  41 |     await loginAs(page, s.persona);
  42 |     failures.length = 0; // only judge the process surfaces, not the login hop
  43 | 
  44 |     for (const route of s.routes) {
  45 |       await page.goto(route, { waitUntil: 'domcontentloaded' });
  46 |       await page.waitForTimeout(3000);
  47 |       const body = (await page.locator('body').innerText().catch(() => '')) || '';
  48 |       expect(body.length, `${route} rendered an empty document for ${s.code}`).toBeGreaterThan(50);
  49 |       if (/access denied|not authorized|unauthorized|permission denied/i.test(body)) {
  50 |         failures.push(`denied-ui ${route}`);
  51 |       }
  52 |     }
  53 | 
> 54 |     expect(failures, `${s.code} surface defects`).toEqual([]);
     |                                                   ^ Error: P08-CONDUCT surface defects
  55 |   });
  56 | }
  57 | 
```