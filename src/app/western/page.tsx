'use client';

import { ArrowLeft, Home } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import PageLayout from '@/components/PageLayout';
import { useSite } from '@/components/SiteProvider';
import VideoCard from '@/components/VideoCard';
import VideoCardSkeleton from '@/components/VideoCardSkeleton';
import { canPlayHlsInBrowser } from '@/lib/hls-playability.client';
import { SearchResult } from '@/lib/types';

const WESTERN_PAGE_STATE_KEY = 'joyflix-western-page-state';

interface WesternPageState {
  page: number;
  pageCount: number;
  items: SearchResult[];
  scrollTop: number;
}

function readSavedState() {
  try {
    const rawState = sessionStorage.getItem(WESTERN_PAGE_STATE_KEY);
    if (!rawState) return null;
    const state = JSON.parse(rawState) as WesternPageState;
    if (!Array.isArray(state.items) || !Number.isInteger(state.page)) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

function getVisiblePages(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: Array<number | 'ellipsis'> = [1];
  const start = Math.max(2, currentPage - 2);
  const end = Math.min(totalPages - 1, currentPage + 2);

  if (start > 2) pages.push('ellipsis');
  for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
    pages.push(pageNumber);
  }
  if (end < totalPages - 1) pages.push('ellipsis');
  pages.push(totalPages);

  return pages;
}

function getPageScrollTop() {
  return Math.max(
    window.scrollY,
    document.documentElement.scrollTop,
    document.body.scrollTop
  );
}

export default function WesternPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mainContainerRef } = useSite();
  const queryPage = Number(searchParams.get('page') || '1');
  const initialPage = Number.isInteger(queryPage) && queryPage > 0 ? queryPage : 1;
  const [savedState] = useState<WesternPageState | null>(() =>
    typeof window === 'undefined' ? null : readSavedState()
  );
  const restoredState =
    savedState && savedState.page === initialPage ? savedState : null;
  const [page, setPage] = useState(initialPage);
  const [pageCount, setPageCount] = useState(restoredState?.pageCount || 0);
  const [pageInput, setPageInput] = useState(String(initialPage));
  const [items, setItems] = useState<SearchResult[]>(restoredState?.items || []);
  const [loading, setLoading] = useState(!restoredState);
  const [error, setError] = useState('');
  const [retryToken, setRetryToken] = useState(0);
  const skipInitialFetchRef = useRef(Boolean(restoredState));

  const getScrollContainer = useCallback(() => {
    if (window.innerWidth < 768) return document.scrollingElement;
    return mainContainerRef?.current;
  }, [mainContainerRef]);

  const savePageState = useCallback(() => {
    try {
      const scrollTop = Math.max(
        getScrollContainer()?.scrollTop || 0,
        getPageScrollTop()
      );
      sessionStorage.setItem(
        WESTERN_PAGE_STATE_KEY,
        JSON.stringify({ page, pageCount, items, scrollTop } satisfies WesternPageState)
      );
    } catch {
      // Không để session storage làm gián đoạn việc duyệt phim.
    }
  }, [getScrollContainer, items, page, pageCount]);

  useEffect(() => {
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false;
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError('');
    setItems([]);

    fetch(`/api/western-catalog?limit=20&page=${page}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Không thể tải phim Âu Mỹ');
        }

        const candidates = Array.isArray(data.items) ? data.items : [];
        const checks = await Promise.all(
          candidates.map(async (item: SearchResult) =>
            (await canPlayHlsInBrowser(item.episodes[0], controller.signal))
              ? item
              : null
          )
        );
        if (controller.signal.aborted) return;

        setItems(checks.filter((item): item is SearchResult => item !== null));
        setPageCount(Number(data.pageCount) || page);
      })
      .catch((requestError) => {
        if (
          !controller.signal.aborted &&
          !(requestError instanceof DOMException && requestError.name === 'AbortError')
        ) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Không thể tải phim Âu Mỹ'
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [page, retryToken]);

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  useEffect(() => {
    if (!restoredState || loading || items.length === 0) return;

    const restoreScroll = () => {
      const scrollTop = restoredState.scrollTop;
      getScrollContainer()?.scrollTo({ top: scrollTop, behavior: 'auto' });
      window.scrollTo({ top: scrollTop, behavior: 'auto' });
    };
    const frame = window.requestAnimationFrame(restoreScroll);
    const retryTimer = window.setTimeout(restoreScroll, 180);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(retryTimer);
    };
  }, [getScrollContainer, items.length, loading, restoredState]);

  useEffect(() => {
    window.addEventListener('pagehide', savePageState);
    return () => {
      window.removeEventListener('pagehide', savePageState);
      savePageState();
    };
  }, [savePageState]);

  const goToPage = useCallback(
    (requestedPage: number) => {
      if (!Number.isInteger(requestedPage) || pageCount < 1) return;
      const nextPage = Math.min(Math.max(requestedPage, 1), pageCount);
      if (nextPage === page) return;
      savePageState();
      setPage(nextPage);
      window.history.replaceState({}, '', `/western?page=${nextPage}`);
      getScrollContainer()?.scrollTo({ top: 0, behavior: 'smooth' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [getScrollContainer, page, pageCount, savePageState]
  );

  const handlePageSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const requestedPage = Number(pageInput);
    if (!pageInput.trim() || !Number.isInteger(requestedPage)) {
      setPageInput(String(page));
      return;
    }
    goToPage(requestedPage);
  };

  const goBack = () => {
    savePageState();
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  const visiblePages = getVisiblePages(page, pageCount);

  return (
    <PageLayout activePath="/western" title="Phim Âu Mỹ">
      <div className="mx-auto w-full max-w-7xl px-4 pb-8 pt-20 md:px-8">
        <div className="mb-6">
          <div className="mb-5 flex items-center gap-2">
            <button
              type="button"
              onClick={goBack}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Quay lại
            </button>
            <button
              type="button"
              onClick={() => {
                savePageState();
                router.push('/');
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
            >
              <Home className="h-4 w-4" />
              Trang chủ
            </button>
          </div>
          <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
            Phim Âu Mỹ
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Tổng hợp nguồn JoyFlix và BDZY. Mỗi thẻ chỉ hiện sau khi kiểm tra
            playlist và đoạn video đầu tiên có thể phát trong trình duyệt.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-950/40 dark:text-red-300">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => setRetryToken((value) => value + 1)}
              className="mt-2 text-sm font-medium underline"
            >
              Thử lại
            </button>
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
            {Array.from({ length: 20 }).map((_, index) => (
              <VideoCardSkeleton key={index} showYear />
            ))}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <p className="py-12 text-center text-gray-500 dark:text-gray-400">
            Trang này hiện chưa có phim nào vượt qua kiểm tra phát.
          </p>
        )}

        {!loading && items.length > 0 && (
          <>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              Trang {page} / {pageCount.toLocaleString('vi-VN')} · {items.length}{' '}
              phim phát được
            </p>
            <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
              {items.map((item, index) => (
                <VideoCard
                  key={`${item.source}-${item.id}`}
                  id={item.id}
                  title={item.title}
                  poster={item.poster}
                  episodes={item.episodes.length}
                  source={item.source}
                  source_name={item.source_name}
                  year={item.year}
                  from="search"
                  onNavigate={savePageState}
                  priority={index < 6}
                />
              ))}
            </div>
          </>
        )}

        {!loading && !error && pageCount > 1 && (
          <nav
            className="mt-8 flex flex-wrap items-center justify-center gap-2"
            aria-label="Phân trang Phim Âu Mỹ"
          >
            <button
              type="button"
              disabled={page === 1}
              onClick={() => goToPage(page - 1)}
              className="rounded-lg bg-gray-100 px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800"
            >
              Trước
            </button>
            {visiblePages.map((pageNumber, index) =>
              pageNumber === 'ellipsis' ? (
                <span
                  key={`ellipsis-${index}`}
                  className="px-1 text-gray-500 dark:text-gray-400"
                  aria-hidden="true"
                >
                  …
                </span>
              ) : (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => goToPage(pageNumber)}
                  aria-current={pageNumber === page ? 'page' : undefined}
                  className={`min-w-10 rounded-lg px-3 py-2 text-sm transition-colors ${
                    pageNumber === page
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {pageNumber}
                </button>
              )
            )}
            <form onSubmit={handlePageSubmit} className="flex items-center gap-2">
              <label htmlFor="western-page" className="sr-only">
                Nhập số trang
              </label>
              <input
                id="western-page"
                type="number"
                min="1"
                max={pageCount}
                value={pageInput}
                onChange={(event) => setPageInput(event.target.value)}
                className="w-16 rounded-lg border border-gray-300 bg-white px-2 py-2 text-center text-sm dark:border-gray-700 dark:bg-gray-900"
              />
              <button
                type="submit"
                className="rounded-lg bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
              >
                Đến trang
              </button>
            </form>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => goToPage(page + 1)}
              className="rounded-lg bg-gray-100 px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800"
            >
              Sau
            </button>
          </nav>
        )}
      </div>
    </PageLayout>
  );
}
