// Small strict validators. Unknown fields are refused (this also refuses a hostile `__proto__` key), numbers must be finite.
import { invalidConfig } from './errors.js';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function objectOf(value, what, make = invalidConfig) {
  if (!isObject(value)) throw make(`${what} must be an object`);
  return value;
}

export function noUnknown(obj, allowed, what, make = invalidConfig) {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) throw make(`${what}: unknown field "${k.slice(0, 40)}"`);
}

// opts: { min, max, int, exclusiveMin, optional, def }
export function num(obj, key, what, { min = -Infinity, max = Infinity, int = false, positive = false, optional = false, def, make = invalidConfig } = {}) {
  if (!own(obj, key) || obj[key] === undefined) {
    if (optional) return def;
    throw make(`${what}.${key} is required`);
  }
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw make(`${what}.${key} must be a finite number`);
  if (positive && v <= 0) throw make(`${what}.${key} must be greater than zero (zero and negative limits are refused)`);
  if (v < min) throw make(`${what}.${key} must be at least ${min}`);
  if (v > max) throw make(`${what}.${key} must be at most ${max}`);
  if (int && !Number.isInteger(v)) throw make(`${what}.${key} must be a whole number`);
  return v;
}

export function bool(obj, key, what, { def, make = invalidConfig } = {}) {
  if (!own(obj, key) || obj[key] === undefined) return def;
  if (typeof obj[key] !== 'boolean') throw make(`${what}.${key} must be true or false`);
  return obj[key];
}

export function oneOf(obj, key, what, values, { optional = false, def, make = invalidConfig } = {}) {
  if (!own(obj, key) || obj[key] === undefined) {
    if (optional) return def;
    throw make(`${what}.${key} is required`);
  }
  if (!values.includes(obj[key])) throw make(`${what}.${key} must be one of ${values.join(', ')}`);
  return obj[key];
}
