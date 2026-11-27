import type { LicenseManager } from './licenseManager';

export type ProFeatureId = 'wcag_auditor' | 'token_export' | 'gradient_boards';

export const PRO_FEATURE_LABELS: Record<
  ProFeatureId,
  { title: string; summary: string }
> = {
  wcag_auditor: {
    title: 'WCAG 2.2 AA/AAA + APCA Contrast Auditor',
    summary:
      'Audit foreground/background contrast ratios, APCA Lc perceptual lightness, and auto-solve nearest compliant OKLCH shades.',
  },
  token_export: {
    title: 'Design Token Exporter',
    summary:
      'Export scanned or custom palettes to Tailwind v4 @theme blocks, CSS Custom Properties, and W3C Design Tokens JSON.',
  },
  gradient_boards: {
    title: 'CSS Gradient Inspector & Local Swatch Boards',
    summary:
      'Extract live page gradients and box-shadows and organize unlimited local swatch boards with JSON import/export.',
  },
};

export class FeatureGate {
  constructor(
    private readonly licenseManager: LicenseManager,
    private readonly checkoutUrl: string
  ) {}

  isAllowed(feature: ProFeatureId): boolean {
    void feature;
    return this.licenseManager.isPro();
  }

  requirePro(
    feature: ProFeatureId,
    onBlocked?: (feature: ProFeatureId, checkoutUrl: string) => void
  ): boolean {
    if (this.isAllowed(feature)) {
      return true;
    }
    onBlocked?.(feature, this.checkoutUrl);
    return false;
  }

  getCheckoutUrl(): string {
    return this.checkoutUrl;
  }
}
