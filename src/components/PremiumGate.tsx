"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { SwitchPlanDialog } from "@/components/SwitchPlanDialog";
import type { Plan } from "@/lib/plan";

export function PremiumGate({ plan, feature, children }: { plan?: Plan; feature: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (plan === "premium") return <>{children}</>;
  return (
    <div className="premium-gate">
      <div className="premium-gate-locked" aria-hidden="true">{children}</div>
      <div className="premium-gate-overlay">
        <Lock size={22} />
        <p>{feature} is a Premium feature.</p>
        <button className="confirm-go" onClick={() => setOpen(true)}>Switch Plan</button>
      </div>
      <SwitchPlanDialog open={open} currentPlan={plan ?? "basic"} onClose={() => setOpen(false)} />
    </div>
  );
}
