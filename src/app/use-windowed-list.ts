import { useEffect, useState, type RefObject } from "react";

export function useWindowedList<T>({
  items,
  scrollRef,
  estimateSize,
  overscan = 8,
}: {
  items: T[];
  scrollRef: RefObject<HTMLElement | null>;
  estimateSize: number;
  overscan?: number;
}) {
  const [range, setRange] = useState(() => ({
    start: 0,
    end: Math.min(items.length, overscan * 2 + 4),
  }));

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) {
      return;
    }

    const updateRange = () => {
      const scrollTop = scrollElement.scrollTop;
      const viewportHeight = scrollElement.clientHeight;
      const start = Math.max(0, Math.floor(scrollTop / estimateSize) - overscan);
      const end = Math.min(
        items.length,
        Math.ceil((scrollTop + viewportHeight) / estimateSize) + overscan,
      );

      setRange((previous) => (previous.start === start && previous.end === end ? previous : { start, end }));
    };

    updateRange();
    scrollElement.addEventListener("scroll", updateRange, { passive: true });

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateRange);

    resizeObserver?.observe(scrollElement);

    return () => {
      scrollElement.removeEventListener("scroll", updateRange);
      resizeObserver?.disconnect();
    };
  }, [estimateSize, items.length, overscan, scrollRef]);

  useEffect(() => {
    setRange({
      start: 0,
      end: Math.min(items.length, overscan * 2 + 4),
    });
  }, [items, overscan]);

  const visibleItems = items.slice(range.start, range.end);

  return {
    visibleItems,
    startIndex: range.start,
    totalHeight: items.length * estimateSize,
    offsetY: range.start * estimateSize,
  };
}
