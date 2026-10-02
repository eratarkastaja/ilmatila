import * as THREE from 'three';

export const GUN_PROJECTILE_SPEED = 1000;
export const GUN_PROJECTILE_LIFETIME = 2.2;
export const GUN_PROJECTILE_GRAVITY = 9.81;
export const GUN_ROUNDS_PER_SECOND = 55;

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
    if (first > 0 && second > 0) time = Math.min(first, second);
    else if (first > 0) time = first;
    else if (second > 0) time = second;
  } else if (Math.abs(b) > 1e-6) {
    const linear = -c / b;
    if (linear > 0) time = linear;
  }
  return THREE.MathUtils.clamp(time, 0, maxTime);
}
