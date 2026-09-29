import * as THREE from 'three';

export const GUN_PROJECTILE_SPEED = 630;
export const GUN_PROJECTILE_LIFETIME = 1.7;

export function estimateInterceptTime(offset, targetVelocity, projectileSpeed, maxTime = 6) {
  const a = targetVelocity.lengthSq() - projectileSpeed * projectileSpeed;
  const b = 2 * offset.dot(targetVelocity);
  const c = offset.lengthSq();
  let time = c > 0 ? Math.sqrt(c) / projectileSpeed : 0;
  const discriminant = b * b - 4 * a * c;
  if (Math.abs(a) > 1e-6 && discriminant >= 0) {
    const root = Math.sqrt(discriminant);
    const first = (-b - root) / (2 * a);
    const second = (-b + root) / (2 * a);
    const valid = [first, second].filter(candidate => candidate > 0);
    if (valid.length) time = Math.min(...valid);
  } else if (Math.abs(b) > 1e-6) {
    const linear = -c / b;
    if (linear > 0) time = linear;
  }
  return THREE.MathUtils.clamp(time, 0, maxTime);
}
