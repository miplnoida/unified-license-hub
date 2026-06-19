import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        draft: "border-transparent bg-slate-100 text-slate-700",
        submitted: "border-transparent bg-blue-100 text-blue-800",
        pending: "border-transparent bg-amber-100 text-amber-800",
        "under-review": "border-transparent bg-purple-100 text-purple-800",
        "query-raised": "border-transparent bg-orange-100 text-orange-800",
        approved: "border-transparent bg-emerald-100 text-emerald-800",
        rejected: "border-transparent bg-red-100 text-red-800",
        overdue: "border-transparent bg-red-100 text-red-800 animate-pulse",
        accepted: "border-transparent bg-emerald-100 text-emerald-800",
        warning: "border-transparent bg-amber-100 text-amber-800",
        returned: "border-transparent bg-yellow-100 text-yellow-800",
        admin: "border-transparent bg-primary text-primary-foreground",
        reviewer: "border-transparent bg-blue-500 text-white",
        approver: "border-transparent bg-emerald-500 text-white",
        supervisor: "border-transparent bg-purple-500 text-white",
        public: "border-transparent bg-secondary text-secondary-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
  )
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
