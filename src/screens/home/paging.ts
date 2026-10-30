/**
 * Home's reviewed cooks, ten to a page (0.3.0).
 *
 * Pure, so the arithmetic is tested on its own: which items a page holds, how
 * many pages there are, and what happens to a page number that no longer
 * exists because a cook was deleted or a search narrowed the list.
 */

/** How many reviewed cooks a page of Home holds. */
export const PAGE_SIZE = 10;

export type Page<T> = {
  /** The items on this page, in order. */
  readonly items: readonly T[];
  /** This page, counted from 1. */
  readonly page: number;
  /** How many pages there are. At least 1, even for an empty list. */
  readonly pageCount: number;
  /** How many items there are on every page together. */
  readonly total: number;
};

export function pageCountFor(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

/** A page number brought inside the pages there are. */
export function clampPage(page: number, total: number, size = PAGE_SIZE): number {
  const count = pageCountFor(total, size);
  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }
  return Math.min(Math.floor(page), count);
}

export function pageOf<T>(items: readonly T[], page: number, size = PAGE_SIZE): Page<T> {
  const current = clampPage(page, items.length, size);
  const start = (current - 1) * size;
  return {
    items: items.slice(start, start + size),
    page: current,
    pageCount: pageCountFor(items.length, size),
    total: items.length,
  };
}

/** "14 cooks · page 1 of 2"; just "3 cooks" when they fit on one page. */
export function pageSummary(page: Pick<Page<unknown>, 'page' | 'pageCount' | 'total'>): string {
  const cooks = page.total === 1 ? '1 cook' : `${page.total} cooks`;
  return page.pageCount > 1 ? `${cooks} · page ${page.page} of ${page.pageCount}` : cooks;
}

/** "1 of 2", between Previous and Next. */
export function pagePosition(page: Pick<Page<unknown>, 'page' | 'pageCount'>): string {
  return `${page.page} of ${page.pageCount}`;
}
