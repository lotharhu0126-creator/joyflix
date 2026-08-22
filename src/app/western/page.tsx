'use client';

import { ArrowLeft, Home } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import PageLayout from '@/components/PageLayout';
import { useSite } from '@/components/SiteProvider';
import VideoCard from '@/components/VideoCard';
import VideoCardSkeleton from '@/components/VideoCardSkeleton';
import { canPlayHlsInBrowser } from '@/lib/hls-playability.client';
import { SearchResult } from '@/lib/types';

const WESTERN_STREAM_STATE_KEY = 'joyflix-western-stream-state';
const MAX_EMPTY_BATCHES_PER_LOAD = 3;

interface WesternStreamState {
  items: SearchResult[];
  nextPage: number;
  lastLoadedPage: number;
  pageCount: number;
  hasMore: boolean;
  scrollTop: number;
}

function normalizeTitle(title: string) {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/(?:粤语|国语|汉语普通话|普通话)(?:版)?/g, '')
    .replace(/[\s·・:：,，.。'"“”‘’()（）\[\]【】{}<>《》_\-—–]/g, '');
}

function shouldReplaceCandidate(
  current: SearchResult,
  candidate: SearchResult
) {
  if (candidate.episodes.length !== current.episodes.length) {
    return candidate.episodes.length > current.episodes.length;
  }
  if (Boolean(candidate.poster) !== Boolean(current.poster)) {
    return Boolean(candidate.poster);
  }
  return Boolean(candidate.desc) && !current.desc;
}

function mergeUniqueItems(
  currentItems: SearchResult[],
  newItems: SearchResult[]
) {
  const uniqueItems = new Map<string, SearchResult>();
  for (const item of [...currentItems, ...newItems]) {
    const key = normalizeTitle(item.title);
    const current = uniqueItems.get(key);
    if (!current || shouldReplaceCandidate(current, item)) {
      uniqueItems.set(key, item);
    }
  }
  return Array.from(uniqueItems.values());
}

function readSavedState(): WesternStreamState | null {
  try {
    const rawState = sessionStorage.getItem(WESTERN_STREAM_STATE_KEY);
    if (!rawState) return null;
    const state = JSON.parse(rawState) as WesternStreamState;
    if (
      !Array.isArray(state.items) ||
      !Number.isInteger(state.nextPage) ||
      !Number.isInteger(state.lastLoadedPage) ||
      !Number.isInteger(state.pageCount) ||
      typeof state.hasMore !== 'boolean'
    ) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
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
  const { mainContainerRef } = useSite();
  const [items, setItems] = useState<SearchResult[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastLoadedPage, setLastLoadedPage] = useState(0);
  const [pageCount, setPageCount] = useState(0);

  const itemsRef = useRef<SearchResult[]>([]);
  const nextPageRef = useRef(1);
  const lastLoadedPageRef = useRef(0);
  const pageCountRef = useRef(0);
  const hasMoreRef = useRef(true);
  const loadingRef = useRef(false);
  const generationRef = useRef(0);
  const loadMoreRef = useRef<() => Promise<void>>(async () => undefined);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollPositionRef = useRef(0);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const scrollSaveTimerRef = useRef<number | null>(null);

  const persistState = useCallback(() => {
    try {
      const scrollTop = Math.max(
        mainContainerRef?.current?.scrollTop ?? 0,
        getPageScrollTop(),
        scrollPositionRef.current
      );
      scrollPositionRef.current = scrollTop;
      sessionStorage.setItem(
        WESTERN_STREAM_STATE_KEY,
        JSON.stringify({
          items: itemsRef.current,
          nextPage: nextPageRef.current,
          lastLoadedPage: lastLoadedPageRef.current,
          pageCount: pageCountRef.current,
          hasMore: hasMoreRef.current,
          scrollTop,
        } satisfies WesternStreamState)
      );
    } catch {
      // Không để session storage làm gián đoạn việc duyệt phim.
    }
  }, [mainContainerRef]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return;

    const generation = generationRef.current;
    loadingRef.current = true;
    setLoading(true);
    setError('');

    let nextPage = nextPageRef.current;
    let nextLastLoadedPage = lastLoadedPageRef.current;
    let nextPageCount = pageCountRef.current;
    let nextHasMore: boolean = hasMoreRef.current;
    const receivedItems: SearchResult[] = [];

    try {
      // Một trang API có thể toàn stream lỗi hoặc bị trùng tên. Trong trường
      // hợp đó chỉ bỏ qua tối đa vài trang rồi trả lại quyền điều khiển cho
      // thao tác cuộn, không tải cả kho một lúc.
      for (
        let batch = 0;
        batch < MAX_EMPTY_BATCHES_PER_LOAD && nextHasMore;
        batch += 1
      ) {
        const controller = new AbortController();
        const response = await fetch(
          `/api/western-catalog?limit=20&page=${nextPage}`,
          { signal: controller.signal }
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Không thể tải thêm phim Âu Mỹ');
        }
        if (generation !== generationRef.current) return;

        const candidates = Array.isArray(data.items) ? data.items : [];
        const checks = await Promise.all(
          candidates.map(async (item: SearchResult) =>
            (await canPlayHlsInBrowser(item.episodes[0], controller.signal))
              ? item
              : null
          )
        );
        if (generation !== generationRef.current) return;

        receivedItems.push(
          ...checks.filter((item): item is SearchResult => item !== null)
        );
        nextLastLoadedPage = nextPage;
        nextPage += 1;
        nextPageCount = Number(data.pageCount) || nextPageCount || nextPage;
        nextHasMore = nextPage <= nextPageCount;

        if (receivedItems.length > 0 || !nextHasMore) break;
      }

      if (generation !== generationRef.current) return;

      const nextItems = mergeUniqueItems(itemsRef.current, receivedItems);
      itemsRef.current = nextItems;
      nextPageRef.current = nextPage;
      lastLoadedPageRef.current = nextLastLoadedPage;
      pageCountRef.current = nextPageCount;
      hasMoreRef.current = nextHasMore;
      setItems(nextItems);
      setLastLoadedPage(nextLastLoadedPage);
      setPageCount(nextPageCount);
      setHasMore(nextHasMore);
      persistState();
    } catch (requestError) {
      if (generation === generationRef.current) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Không thể tải thêm phim Âu Mỹ'
        );
      }
    } finally {
      if (generation === generationRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [persistState]);

  loadMoreRef.current = loadMore;

  useEffect(() => {
    generationRef.current += 1;
    const savedState = readSavedState();

    if (savedState) {
      itemsRef.current = mergeUniqueItems([], savedState.items);
      nextPageRef.current = savedState.nextPage;
      lastLoadedPageRef.current = savedState.lastLoadedPage;
      pageCountRef.current = savedState.pageCount;
      hasMoreRef.current = savedState.hasMore;
      scrollPositionRef.current = savedState.scrollTop;
      pendingScrollRestoreRef.current = savedState.scrollTop;
      setItems(itemsRef.current);
      setLastLoadedPage(savedState.lastLoadedPage);
      setPageCount(savedState.pageCount);
      setHasMore(savedState.hasMore);
      setLoading(false);
      setError('');
      return;
    }

    itemsRef.current = [];
    nextPageRef.current = 1;
    lastLoadedPageRef.current = 0;
    pageCountRef.current = 0;
    hasMoreRef.current = true;
    loadingRef.current = false;
    scrollPositionRef.current = 0;
    pendingScrollRestoreRef.current = 0;
    setItems([]);
    setLastLoadedPage(0);
    setPageCount(0);
    setHasMore(true);
    setLoading(true);
    setError('');
    void loadMore();
  }, [loadMore]);

  useEffect(() => {
    const container = mainContainerRef?.current;

    const flushScrollPosition = () => {
      if (scrollSaveTimerRef.current !== null) {
        window.clearTimeout(scrollSaveTimerRef.current);
        scrollSaveTimerRef.current = null;
      }
      persistState();
    };

    const handleScroll = () => {
      scrollPositionRef.current = Math.max(
        container?.scrollTop ?? 0,
        getPageScrollTop()
      );
      if (scrollSaveTimerRef.current !== null) return;
      scrollSaveTimerRef.current = window.setTimeout(flushScrollPosition, 150);
    };

    container?.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('pagehide', flushScrollPosition);
    return () => {
      container?.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('pagehide', flushScrollPosition);
      flushScrollPosition();
    };
  }, [mainContainerRef, persistState]);

  useEffect(() => {
    const scrollTop = pendingScrollRestoreRef.current;
    const container = mainContainerRef?.current;
    if (
      scrollTop === null ||
      !container ||
      loading ||
      (scrollTop > 0 && items.length === 0)
    ) {
      return;
    }

    const restoreScrollPosition = () => {
      container.scrollTo({ top: scrollTop, behavior: 'auto' });
      window.scrollTo({ top: scrollTop, behavior: 'auto' });
      scrollPositionRef.current = scrollTop;
    };

    const frame = window.requestAnimationFrame(restoreScrollPosition);
    const retryTimer = window.setTimeout(restoreScrollPosition, 180);
    pendingScrollRestoreRef.current = null;
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(retryTimer);
    };
  }, [items.length, loading, mainContainerRef]);

  useEffect(() => {
    const target = sentinelRef.current;
    if (!target || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMoreRef.current();
        }
      },
      {
        root: mainContainerRef?.current || null,
        rootMargin: '700px 0px',
      }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loading, mainContainerRef]);

  const goBack = () => {
    persistState();
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  const initialLoading = loading && items.length === 0;

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
                persistState();
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
            Tải dần khi bạn cuộn. Mỗi thẻ chỉ hiện sau khi kiểm tra playlist và
            đoạn video đầu tiên có thể phát trong trình duyệt.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-950/40 dark:text-red-300">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void loadMore()}
              className="mt-2 text-sm font-medium underline"
            >
              Thử lại
            </button>
          </div>
        )}

        {initialLoading && (
          <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
            {Array.from({ length: 20 }).map((_, index) => (
              <VideoCardSkeleton key={index} showYear />
            ))}
          </div>
        )}

        {!initialLoading && !error && items.length === 0 && (
          <p className="py-12 text-center text-gray-500 dark:text-gray-400">
            Hiện chưa có phim nào vượt qua kiểm tra phát.
          </p>
        )}

        {items.length > 0 && (
          <>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              Đã tải {items.length.toLocaleString('vi-VN')} phim phát được
              {lastLoadedPage > 0 &&
                ` · đang ở lô ${lastLoadedPage}${
                  pageCount > 0 ? ` / ${pageCount}` : ''
                }`}
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
                  onNavigate={persistState}
                  priority={index < 6}
                />
              ))}
            </div>
          </>
        )}

        <div ref={sentinelRef} className="h-1" aria-hidden="true" />

        {loading && !initialLoading && (
          <div className="mt-6 grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
            {Array.from({ length: 7 }).map((_, index) => (
              <VideoCardSkeleton key={index} showYear />
            ))}
          </div>
        )}

        {!loading && !error && !hasMore && items.length > 0 && (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            Đã tải hết phim Âu Mỹ hiện có từ các nguồn đang hoạt động.
          </p>
        )}
      </div>
    </PageLayout>
  );
}
