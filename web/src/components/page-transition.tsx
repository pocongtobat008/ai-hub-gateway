"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [displayChildren, setDisplayChildren] = useState(children);
  const [transitionStage, setTransitionStage] = useState<"enter" | "visible" | "exit">("visible");
  const prevPathname = useRef(pathname);

  useEffect(() => {
    if (pathname !== prevPathname.current) {
      // Path changed → start exit animation
      setTransitionStage("exit");

      const timer = setTimeout(() => {
        // After exit animation, swap children and start enter
        prevPathname.current = pathname;
        setDisplayChildren(children);
        setTransitionStage("enter");

        const enterTimer = setTimeout(() => {
          setTransitionStage("visible");
        }, 300);

        return () => clearTimeout(enterTimer);
      }, 200);

      return () => clearTimeout(timer);
    } else {
      setDisplayChildren(children);
    }
  }, [pathname, children]);

  return (
    <div
      className={cn(
        "transition-all duration-300 ease-in-out",
        transitionStage === "exit" && "opacity-0 translate-y-2 scale-[0.99]",
        transitionStage === "enter" && "opacity-0 -translate-y-2 scale-[0.99]",
        transitionStage === "visible" && "opacity-100 translate-y-0 scale-100",
      )}
    >
      {displayChildren}
    </div>
  );
}
