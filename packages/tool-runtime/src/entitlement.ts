import type { Entitlement, ToolManifest } from '@nekotools/contracts';
import { FREE_ENTITLEMENT } from '@nekotools/contracts';

/**
 * Phase 0 entitlement check.
 *
 * The signature-verification path lands when Pro modules ship. Until then
 * the runtime accepts only the synthetic FREE_ENTITLEMENT and gates any
 * Pro feature behind it. The point of Phase 0 is to encode the rule —
 * "no Pro implementation exists in the free build" — so that even with
 * the verifier still a stub, the public build cannot accidentally enable
 * a Pro feature flag.
 */
export function isFeatureAllowed(
  manifest: ToolManifest,
  feature: string,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): boolean {
  if (manifest.entitlements.free.includes(feature)) return true;
  if (manifest.entitlements.pro.includes(feature)) {
    return entitlement.tier !== 'free' && entitlement.features.includes(feature);
  }
  return false;
}
