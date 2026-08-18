export type Plan = "basic" | "premium";

export function isPremium(plan?: Plan) {
  return plan === "premium";
}
