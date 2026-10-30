import { useLayoutEffect, type RefObject } from "react";

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- the chat keeps to its newest message, and everything glides as things arrive ----------
/**
 * The module sits centred on the stage, so when something arrives it grows both ways: the chat moves up
 * and the composer moves down. Each part is held where it was, then eased into its new place. Inside, the
 * chat keeps to its newest message once it's taller than the screen (unless you've scrolled back up).
 */
export function useGlide(scrollRef: RefObject<HTMLElement | null>, contentRef: RefObject<HTMLElement | null>, lowerRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    const lower = lowerRef.current;
    if (!scroller || !content || !lower) return;
    // where each part sits without its glide, and how far it's being held from there
    const parts = [content, lower].map((el) => ({ el, offset: 0, top: el.getBoundingClientRect().top }));
    let lastH = content.offsetHeight;
    let raf = 0;
    let prev = 0;
    scroller.scrollTop = scroller.scrollHeight;
    const apply = (p: (typeof parts)[number]) => (p.el.style.transform = p.offset ? `translateY(${p.offset.toFixed(2)}px)` : "");
    const glide = (now: number) => {
      const dt = prev ? Math.min(64, now - prev) : 16;
      prev = now;
      let moving = false;
      for (const p of parts) {
        p.offset *= Math.exp(-dt / 110);
        if (Math.abs(p.offset) < 0.25) p.offset = 0;
        else moving = true;
        apply(p);
      }
      if (moving) {
        raf = requestAnimationFrame(glide);
      } else {
        raf = 0;
        prev = 0;
      }
    };
    // the fade and its padding only once the chat scrolls (see .scroller[data-overflow] in the CSS)
    // measured from the content's own height: its glide transform would count towards scrollHeight
    const markOverflow = () => (scroller.dataset.overflow = String(content.offsetHeight > scroller.clientHeight + 1));
    markOverflow();
    const settle = () => {
      markOverflow();
      const h = content.offsetHeight;
      const d = h - lastH;
      lastH = h;
      // follow the newest message only if it was at the bottom before this growth (measured without the
      // glide's transform, which would count towards scrollHeight while something grows mid-glide)
      const gap = Math.max(scroller.clientHeight, h - d) - scroller.scrollTop - scroller.clientHeight;
      if (d && gap <= 24) scroller.scrollTop = scroller.scrollHeight;
      const reduce = reducedMotion();
      for (const p of parts) {
        const top = p.el.getBoundingClientRect().top - p.offset;
        p.offset = reduce ? 0 : Math.max(-320, Math.min(320, p.offset + p.top - top));
        p.top = top;
        apply(p);
      }
      if (!raf && !reduce) raf = requestAnimationFrame(glide);
    };
    // scrolling moves the chat on purpose: take its new place as given, without gliding
    const onScroll = () => {
      parts[0].top = content.getBoundingClientRect().top - parts[0].offset;
    };
    const ro = new ResizeObserver(settle);
    ro.observe(content);
    ro.observe(lower);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect();
      scroller.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [scrollRef, contentRef, lowerRef]);
}
