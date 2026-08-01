export const MIN_RENDER_SCALE = 0.58;

export function initialRenderScale(viewportWidth: number): number {
  return Number.isFinite(viewportWidth) && viewportWidth < 700 ? 0.72 : 0.82;
}

export function maximumRenderScale(viewportWidth: number): number {
  return Number.isFinite(viewportWidth) && viewportWidth < 700 ? 0.76 : 0.9;
}

export function adaptiveRenderScale(current: number, averageFrameMs: number, viewportWidth: number): number {
  const maximum = maximumRenderScale(viewportWidth);
  const safeCurrent = Number.isFinite(current) ? Math.min(maximum, Math.max(MIN_RENDER_SCALE, current)) : initialRenderScale(viewportWidth);
  if (!Number.isFinite(averageFrameMs) || averageFrameMs <= 0) return safeCurrent;
  const next = averageFrameMs > 24
    ? safeCurrent - 0.06
    : averageFrameMs > 19
      ? safeCurrent - 0.03
      : averageFrameMs < 15.5
        ? safeCurrent + 0.03
        : safeCurrent;
  return Math.round(Math.min(maximum, Math.max(MIN_RENDER_SCALE, next)) * 100) / 100;
}
