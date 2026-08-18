"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { Plan } from "@/lib/plan";

const BASIC_FEATURES = ["Send SOS", "Check on me", "Emergency services nearby", "Route planning & risk brief", "Trip-time optimization"];
const PREMIUM_FEATURES = ["Everything in Basic", "SOS script generator", "Bangla safe-word voice SOS", "Share live location", "Route readiness & offline low-network packs"];

export function SwitchPlanDialog({ open, currentPlan, onClose }: { open: boolean; currentPlan: Plan; onClose: () => void }) {
  const [switching, setSwitching] = useState(false);
  const target: Plan = currentPlan === "premium" ? "basic" : "premium";

  async function switchPlan() {
    setSwitching(true);
    try {
      await apiFetch("/api/me/plan", { method: "PUT", body: JSON.stringify({ plan: target }) });
      window.dispatchEvent(new Event("plan:changed"));
      onClose();
    } finally {
      setSwitching(false);
    }
  }

  if (!open) return null;
  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="confirm-dialog switch-plan-dialog" role="dialog" aria-modal="true" aria-labelledby="switch-plan-title" onClick={(event) => event.stopPropagation()}>
        <h3 id="switch-plan-title">Switch plan</h3>
        <div className="plan-columns">
          <article className={`plan-card ${currentPlan === "basic" ? "current" : ""}`}>
            <p className="eyebrow">{currentPlan === "basic" ? "Current plan" : "Basic plan"}</p>
            <h4>Basic</h4>
            <ul>{BASIC_FEATURES.map((feature) => <li key={feature}>{feature}</li>)}</ul>
            {currentPlan === "premium" && <button className="confirm-no" disabled={switching} onClick={() => void switchPlan()}>Switch to Basic</button>}
          </article>
          <article className={`plan-card ${currentPlan === "premium" ? "current" : ""}`}>
            <p className="eyebrow">{currentPlan === "premium" ? "Current plan" : "Premium plan"}</p>
            <h4>Premium</h4>
            <ul>{PREMIUM_FEATURES.map((feature) => <li key={feature}>{feature}</li>)}</ul>
            {currentPlan === "basic" && <button className="confirm-go" disabled={switching} onClick={() => void switchPlan()}>Switch to Premium</button>}
          </article>
        </div>
        <div className="confirm-actions"><button className="confirm-no" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
