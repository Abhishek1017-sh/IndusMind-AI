import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes safely.
 *
 * `clsx` resolves conditionals/arrays/objects into a class string, then
 * `twMerge` removes genuine Tailwind conflicts so a caller-supplied class always
 * wins over a component default (e.g. `<Button className="bg-red-600">`
 * overrides the variant's `bg-indigo-600` instead of both landing in the DOM and
 * losing to CSS source order).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
