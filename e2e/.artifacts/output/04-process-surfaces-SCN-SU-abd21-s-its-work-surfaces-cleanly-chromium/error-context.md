# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 04-process-surfaces.spec.ts >> SCN-SURFACE-P04-LICENCE: owning persona opens its work surfaces cleanly
- Location: e2e/cert-v2/04-process-surfaces.spec.ts:29:3

# Error details

```
Error: P04-LICENCE surface defects

expect(received).toEqual(expected) // deep equality

- Expected  -   1
+ Received  + 386

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
+     at EP (http://localhost:8080/src/routes/dashboardRoutes.tsx:282:15)
+     at RenderedRoute (http://loc",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `EP`. 
+     at P (http://localhost:8080/src/routes/routeHelpers.tsx:217:87)
+   ",
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
+ Check the render method of `AppShell`. 
+     at RouteContentSkeleton (http://localhost:8080/src/component",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `LicensesList`. 
+     at DashboardLayout (http://localhost:8080/src/components",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `LicensesList`. 
+     at PageHeader (http://localhost:8080/src/components/shar",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `LicensesList`. 
+     at Select (http://localhost:8080/node_modules/.vite/deps",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `SelectContent`. 
+     at SelectPortal
+     at _c4 (http://localhost:8080/src/c",
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
+   "http 400 https://sndfttzqmbkmkcnrvpfn.supabase.co/rest/v1/licenses",
+   "console: Failed to load resource: the server responded with a status of 400 ()",
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
+ Check the render method of `AppShell`. 
+     at RouteContentSkeleton (http://localhost:8080/src/component",
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
            - button "My Work" [expanded] [ref=f2e34] [cursor=pointer]
            - generic [ref=f2e44]:
              - link "Notifications" [ref=f2e45] [cursor=pointer]:
                - /url: /notifications
              - link "My Payments" [ref=f2e51] [cursor=pointer]:
                - /url: /payments
          - generic [ref=f2e56]:
            - button "Entities & Registry" [ref=f2e57] [cursor=pointer]
            - link "Onboarding Oversight" [ref=f2e67] [cursor=pointer]:
              - /url: /licensing/onboarding-oversight
          - generic [ref=f2e74]:
            - button "Licensing & Authorisation" [expanded] [ref=f2e75] [cursor=pointer]
            - generic [ref=f2e85]:
              - generic [ref=f2e86]:
                - button "Applications" [ref=f2e87] [cursor=pointer]
                - link "Review Queue" [ref=f2e97] [cursor=pointer]:
                  - /url: /applications/queue
              - generic [ref=f2e103]:
                - button "Registration" [ref=f2e104] [cursor=pointer]
                - link "Registration Review" [ref=f2e113] [cursor=pointer]:
                  - /url: /admin/registration-review
              - generic [ref=f2e120]:
                - button "Licences" [expanded] [ref=f2e121] [cursor=pointer]
                - generic [ref=f2e131]:
                  - link "Licence Holders" [ref=f2e132] [cursor=pointer]:
                    - /url: /admin/licensees
                  - link "Licence Lifecycle" [ref=f2e139] [cursor=pointer]:
                    - /url: /licenses/lifecycle
                  - link "Approved Licensees" [ref=f2e147] [cursor=pointer]:
                    - /url: /admin/approved-licensees
          - generic [ref=f2e153]:
            - button "Supervision" [ref=f2e154] [cursor=pointer]
            - generic [ref=f2e162]:
              - generic [ref=f2e163]:
                - button "Supervisory Planning" [ref=f2e164] [cursor=pointer]
                - link "Coordination Cases" [ref=f2e174] [cursor=pointer]:
                  - /url: /coordination
              - generic [ref=f2e183]:
                - button "Market Conduct" [ref=f2e184] [cursor=pointer]
                - generic [ref=f2e196]:
                  - link "Complaints" [ref=f2e197] [cursor=pointer]:
                    - /url: /complaints
                  - link "Duplicate Detection" [ref=f2e202] [cursor=pointer]:
                    - /url: /complaints/duplicates
                  - link "Auto-Escalation" [ref=f2e212] [cursor=pointer]:
                    - /url: /complaints/escalations
                  - link "RFI Approvals" [ref=f2e217] [cursor=pointer]:
                    - /url: /complaints/rfi-approvals
                  - link "Complaint Bulk Intake" [ref=f2e224] [cursor=pointer]:
                    - /url: /complaints/bulk-intake
              - generic [ref=f2e230]:
                - button "Fit & Proper" [ref=f2e231] [cursor=pointer]
                - generic [ref=f2e240]:
                  - link "Overview" [ref=f2e241] [cursor=pointer]:
                    - /url: /fpa
                  - link "Processes" [ref=f2e249] [cursor=pointer]:
                    - /url: /fpa/processes
                  - link "Sector Rules" [ref=f2e256] [cursor=pointer]:
                    - /url: /fpa/sector-rules
                  - link "Initiation Paths" [ref=f2e260] [cursor=pointer]:
                    - /url: /fpa/initiation
                  - link "Individual Register" [ref=f2e267] [cursor=pointer]:
                    - /url: /fpa/individuals
                  - link "Initiation Log" [ref=f2e275] [cursor=pointer]:
                    - /url: /fpa/initiation-log
                  - link "Declarations" [ref=f2e281] [cursor=pointer]:
                    - /url: /fpa/declarations
                  - link "Invitation Tracker" [ref=f2e289] [cursor=pointer]:
                    - /url: /fpa/invitations
                  - link "Screening Hub" [ref=f2e295] [cursor=pointer]:
                    - /url: /fpa/screening
                  - link "Manual Review Queue" [ref=f2e301] [cursor=pointer]:
                    - /url: /fpa/manual-tasks
                  - link "Findings Console" [ref=f2e307] [cursor=pointer]:
                    - /url: /fpa/findings
                  - link "AI Analysis" [ref=f2e312] [cursor=pointer]:
                    - /url: /fpa/ai-analysis
                  - link "Committee Voting" [ref=f2e327] [cursor=pointer]:
                    - /url: /fpa/committee
                  - link "Determinations" [ref=f2e334] [cursor=pointer]:
                    - /url: /fpa/determinations
                  - link "Conditions & SLA" [ref=f2e343] [cursor=pointer]:
                    - /url: /fpa/conditions
                  - link "Reassessment Scheduler" [ref=f2e349] [cursor=pointer]:
                    - /url: /fpa/scheduler
                  - link "Monitoring & Audit" [ref=f2e355] [cursor=pointer]:
                    - /url: /fpa/monitoring
                  - link "F&P Appeals" [ref=f2e365] [cursor=pointer]:
                    - /url: /fpa/appeals
                  - link "Notification Log" [ref=f2e372] [cursor=pointer]:
                    - /url: /fpa/notifications
                  - link "Trends & History" [ref=f2e379] [cursor=pointer]:
                    - /url: /fpa/trends
                  - link "Training & Awareness" [ref=f2e384] [cursor=pointer]:
                    - /url: /fpa/training
          - generic [ref=f2e390]:
            - button "Insights & Reporting" [ref=f2e391] [cursor=pointer]
            - generic [ref=f2e398]:
              - link "Analytics" [ref=f2e399] [cursor=pointer]:
                - /url: /analytics
              - link "AI Reports" [ref=f2e404] [cursor=pointer]:
                - /url: /analytics/ai-reports
              - link "Reports" [ref=f2e419] [cursor=pointer]:
                - /url: /reports
    - generic [ref=f2e425]:
      - banner [ref=f2e426]:
        - button "Search navigation" [ref=f2e428] [cursor=pointer]:
          - generic [ref=f2e432]: Search...
          - generic [ref=f2e433]: ⌘K
        - generic [ref=f2e434]:
          - button "Notifications" [ref=f2e435] [cursor=pointer]
          - button "C Certification - Licensing Supervisor Licensing Supervisor, Applicant" [ref=f2e436] [cursor=pointer]:
            - generic [ref=f2e437]: C
            - generic [ref=f2e439]:
              - paragraph [ref=f2e440]: Certification - Licensing Supervisor
              - paragraph [ref=f2e441]: Licensing Supervisor, Applicant
      - main [ref=f2e442]:
        - generic [ref=f2e443]:
          - navigation "breadcrumb" [ref=f2e444]:
            - list [ref=f2e445]:
              - listitem [ref=f2e446]:
                - link "Home" [ref=f2e447] [cursor=pointer]:
                  - /url: /dashboard
              - listitem [ref=f2e448]
              - listitem [ref=f2e451]:
                - link "Licences" [ref=f2e452] [cursor=pointer]:
                  - /url: /licenses
              - listitem [ref=f2e453]
              - listitem [ref=f2e456]:
                - link "Licence" [disabled] [ref=f2e457]
          - generic [ref=f2e459]:
            - generic [ref=f2e460]:
              - heading "Licence lifecycle queue" [level=1] [ref=f2e461]
              - paragraph [ref=f2e462]: Renewals, expiries, conditions and adverse matters awaiting regulator action.
            - tablist [ref=f2e464]:
              - tab "All work 0" [selected] [ref=f2e465] [cursor=pointer]:
                - text: All work
                - generic [ref=f2e466]: "0"
              - tab "Renewals 0" [ref=f2e467] [cursor=pointer]:
                - text: Renewals
                - generic [ref=f2e468]: "0"
              - tab "Expiry 0" [ref=f2e469] [cursor=pointer]:
                - text: Expiry
                - generic [ref=f2e470]: "0"
              - tab "Conditions 0" [ref=f2e471] [cursor=pointer]:
                - text: Conditions
                - generic [ref=f2e472]: "0"
              - tab "Adverse matters 0" [ref=f2e473] [cursor=pointer]:
                - text: Adverse matters
                - generic [ref=f2e474]: "0"
            - generic [ref=f2e475]:
              - generic [ref=f2e476]:
                - heading "0 items" [level=3] [ref=f2e477]
                - textbox "Search licence or entity" [ref=f2e482]
              - paragraph [ref=f2e484]: No lifecycle work in this view.
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
     |                                                   ^ Error: P04-LICENCE surface defects
  55 |   });
  56 | }
  57 | 
```