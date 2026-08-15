"use client";

import {
  Children,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";

const DEFAULT_PAGE_SIZE = 20;

function useInfiniteScroll(total: number, pageSize: number) {
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(pageSize, total),
  );
  const sentinelRef = useRef<HTMLButtonElement>(null);
  const hasMore = visibleCount < total;

  const showMore = useCallback(() => {
    setVisibleCount((current) => Math.min(current + pageSize, total));
  }, [pageSize, total]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) showMore();
      },
      { rootMargin: "240px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, showMore, visibleCount]);

  return { hasMore, sentinelRef, showMore, visibleCount };
}

type InfiniteListProps = {
  children: ReactNode;
  className?: string;
  pageSize?: number;
};

export function InfiniteList({
  children,
  className,
  pageSize = DEFAULT_PAGE_SIZE,
}: InfiniteListProps) {
  const items = Children.toArray(children);
  const { hasMore, sentinelRef, showMore, visibleCount } = useInfiniteScroll(
    items.length,
    pageSize,
  );

  return (
    <>
      <ul className={className}>{items.slice(0, visibleCount)}</ul>
      <LoadMoreControl
        hasMore={hasMore}
        onLoadMore={showMore}
        ref={sentinelRef}
        total={items.length}
        visibleCount={visibleCount}
      />
    </>
  );
}

type InfiniteTableBodyProps = {
  children: ReactNode;
  colSpan: number;
  pageSize?: number;
};

export function InfiniteTableBody({
  children,
  colSpan,
  pageSize = DEFAULT_PAGE_SIZE,
}: InfiniteTableBodyProps) {
  const rows = Children.toArray(children);
  const { hasMore, sentinelRef, showMore, visibleCount } = useInfiniteScroll(
    rows.length,
    pageSize,
  );

  return (
    <>
      <tbody className="divide-y divide-line">
        {rows.slice(0, visibleCount)}
      </tbody>
      {hasMore && (
        <tfoot>
          <tr>
            <td className="px-4 py-3 text-center" colSpan={colSpan}>
              <Button
                ref={sentinelRef}
                type="button"
                size="sm"
                variant="ghost"
                onClick={showMore}
              >
                Load more ({visibleCount} of {rows.length})
              </Button>
            </td>
          </tr>
        </tfoot>
      )}
    </>
  );
}

type LoadMoreControlProps = {
  hasMore: boolean;
  onLoadMore: () => void;
  ref: React.Ref<HTMLButtonElement>;
  total: number;
  visibleCount: number;
};

function LoadMoreControl({
  hasMore,
  onLoadMore,
  ref,
  total,
  visibleCount,
}: LoadMoreControlProps) {
  if (!hasMore) return null;

  return (
    <div className="flex justify-center pt-1">
      <Button
        ref={ref}
        type="button"
        size="sm"
        variant="ghost"
        onClick={onLoadMore}
      >
        Load more ({visibleCount} of {total})
      </Button>
    </div>
  );
}
