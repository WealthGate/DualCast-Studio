import type { LowerThirdAnimation } from "../../shared/types";

export function sanctuaryTextKeyframes(animation: LowerThirdAnimation, exit = false): Keyframe[] {
  const hidden = { opacity: 0 }, shown = { opacity: 1, transform: "none", clipPath: "inset(0 0 0 0)" };
  if (animation === "none") return [shown, shown];
  if (animation === "spring" && !exit) return [{ ...hidden, transform: "translateY(18%) scale(.9)" }, { opacity: 1, transform: "translateY(-2%) scale(1.025)", offset: .78 }, shown];
  const transform = animation === "slide-left" ? `translateX(${exit ? "-" : ""}110%)` : animation === "slide-right" ? `translateX(${exit ? "" : "-"}110%)`
    : animation === "slide-up" ? `translateY(${exit ? "-" : ""}110%)` : animation === "slide-down" ? `translateY(${exit ? "" : "-"}110%)`
    : animation === "zoom" || animation === "spring" ? "scale(.84)" : animation === "reveal" ? "translateX(-1.2em)" : "none";
  const away: Keyframe = { ...hidden, transform, clipPath: animation === "wipe" || animation === "reveal" ? "inset(0 100% 0 0)" : "inset(0 0 0 0)" };
  return exit ? [shown, away] : [away, shown];
}
