"use client";

import { ArrowLeft, Home, LoaderCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import PageLayout from "@/components/PageLayout";
import { useSite } from "@/components/SiteProvider";
import VideoCard from "@/components/VideoCard";
import VideoCardSkeleton from "@/components/VideoCardSkeleton";
import { SearchResult } from "@/lib/types";

const CATEGORIES = {
  series: "港澳剧",
  movie: "港澳电影",
} as const;

const MAX_EMPTY_BATCHES_PER_LOAD = 4;
const STREAM_STATE_PREFIX = "joyflix-cantonese-stream";

type CantoneseCategory = keyof typeof CATEGORIES;

interface StreamCursor {
  sourceIndex: number;
  page: number;
}

interface StoredStreamState {
  items: SearchResult[];
  cursor: StreamCursor | null;
  hasMore: boolean;
  sourceCount: number;
  sourceName: string;
  sourcePage: number;
}

function normalizeTitle(title: string) {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/(?:粤语|国语|汉语普通话|普通话)(?:版)?/g, "")
    .replace(/[\s·・:：,，.。'"“”‘’()（）\[\]【】{}<>《》_\-—–]/g, "");
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

function getStorageKey(category: CantoneseCategory) {
  return `${STREAM_STATE_PREFIX}:${category}`;
}

function getScrollStorageKey(category: CantoneseCategory) {
  return `${getStorageKey(category)}:scroll-top`;
}

function readSavedScrollPosition(category: CantoneseCategory) {
  try {
    const saved = Number(sessionStorage.getItem(getScrollStorageKey(category)));
    return Number.isFinite(saved) && saved > 0 ? saved : 0;
  } catch {
    return 0;
  }
}

function saveScrollPosition(category: CantoneseCategory, scrollTop: number) {
  try {
    sessionStorage.setItem(
      getScrollStorageKey(category),
      String(Math.max(0, Math.round(scrollTop)))
    );
  } catch {
    // Không để lỗi bộ nhớ phiên làm gián đoạn việc duyệt phim.
  }
}

function getPageScrollTop() {
  return Math.max(
    window.scrollY,
    document.documentElement.scrollTop,
    document.body.scrollTop
  );
}

function readSavedState(category: CantoneseCategory): StoredStreamState | null {
  try {
    const raw = sessionStorage.getItem(getStorageKey(category));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredStreamState;
    if (!Array.isArray(parsed.items) || (parsed.hasMore && !parsed.cursor)) {
      return null;
    }
    if (
      parsed.cursor &&
      (!Number.isInteger(parsed.cursor.sourceIndex) ||
        !Number.isInteger(parsed.cursor.page))
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveState(category: CantoneseCategory, state: StoredStreamState) {
  sessionStorage.setItem(getStorageKey(category), JSON.stringify(state));
}

export default function CantonesePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mainContainerRef } = useSite();
  const category: CantoneseCategory =
    searchParams.get("category") === "movie" ? "movie" : "series";

  const [items, setItems] = useState<SearchResult[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sourceCount, setSourceCount] = useState(0);
  const [sourceName, setSourceName] = useState("");
  const [sourcePage, setSourcePage] = useState(1);

  const itemsRef = useRef<SearchResult[]>([]);
  const cursorRef = useRef<StreamCursor | null>({ sourceIndex: 0, page: 1 });
  const hasMoreRef = useRef<boolean>(true);
  const loadingRef = useRef(false);
  const sourceCountRef = useRef(0);
  const sourceNameRef = useRef("");
  const sourcePageRef = useRef(1);
  const generationRef = useRef(0);
  const loadMoreRef = useRef<() => Promise<void>>(async () => undefined);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollPositionRef = useRef(0);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const scrollSaveTimerRef = useRef<number | null>(null);

  const persistScrollPosition = useCallback(() => {
    const containerScrollTop = mainContainerRef?.current?.scrollTop ?? 0;
    // Desktop dùng khung nội dung để cuộn, còn điện thoại thường cuộn toàn trang.
    const scrollTop = Math.max(
      containerScrollTop,
      getPageScrollTop(),
      scrollPositionRef.current
    );
    scrollPositionRef.current = scrollTop;
    saveScrollPosition(category, scrollTop);
  }, [category, mainContainerRef]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current || !cursorRef.current) {
      return;
    }

    const generation = generationRef.current;
    loadingRef.current = true;
    setLoading(true);
    setError("");

    let nextCursor = cursorRef.current;
    let nextHasMore: boolean = hasMoreRef.current;
    let nextSourceCount = sourceCountRef.current;
    let nextSourceName = sourceNameRef.current;
    let nextSourcePage = sourcePageRef.current;
    const receivedItems: SearchResult[] = [];

    try {
      // Nếu nguồn hiện tại không có phim hợp lệ cho nhóm đang xem, bỏ qua tối
      // đa vài trang liên tiếp rồi trả quyền điều khiển lại cho thao tác cuộn.
      for (
        let batch = 0;
        batch < MAX_EMPTY_BATCHES_PER_LOAD && nextCursor && nextHasMore;
        batch += 1
      ) {
        const query = new URLSearchParams({
          category,
          source: String(nextCursor.sourceIndex),
          page: String(nextCursor.page),
        });
        const response = await fetch(`/api/cantonese-stream?${query}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Không thể tải thêm nội dung");
        }
        if (generation !== generationRef.current) return;

        receivedItems.push(...(data.items || []));
        nextCursor = data.nextCursor || null;
        nextHasMore = Boolean(data.hasMore);
        nextSourceCount = Number(data.sourceCount) || nextSourceCount;
        nextSourceName = data.sourceName || nextSourceName;
        nextSourcePage = Number(data.sourcePage) || nextSourcePage;

        if ((data.items || []).length > 0 || !nextHasMore) break;
      }

      if (generation !== generationRef.current) return;

      const nextItems = mergeUniqueItems(itemsRef.current, receivedItems);
      itemsRef.current = nextItems;
      cursorRef.current = nextCursor;
      hasMoreRef.current = nextHasMore;
      sourceCountRef.current = nextSourceCount;
      sourceNameRef.current = nextSourceName;
      sourcePageRef.current = nextSourcePage;
      setItems(nextItems);
      setHasMore(nextHasMore);
      setSourceCount(nextSourceCount);
      setSourceName(nextSourceName);
      setSourcePage(nextSourcePage);
      saveState(category, {
        items: nextItems,
        cursor: nextCursor,
        hasMore: nextHasMore,
        sourceCount: nextSourceCount,
        sourceName: nextSourceName,
        sourcePage: nextSourcePage,
      });
    } catch (requestError) {
      if (generation === generationRef.current) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Không thể tải thêm nội dung"
        );
      }
    } finally {
      if (generation === generationRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [category]);

  loadMoreRef.current = loadMore;

  useEffect(() => {
    generationRef.current += 1;
    const savedState = readSavedState(category);
    const savedScrollPosition = readSavedScrollPosition(category);
    // Mỗi tab có vị trí riêng; tab chưa từng mở sẽ bắt đầu từ đầu trang.
    pendingScrollRestoreRef.current = savedState ? savedScrollPosition : 0;
    scrollPositionRef.current = savedScrollPosition;

    if (savedState) {
      itemsRef.current = mergeUniqueItems([], savedState.items);
      cursorRef.current = savedState.cursor;
      hasMoreRef.current = savedState.hasMore;
      sourceCountRef.current = savedState.sourceCount;
      sourceNameRef.current = savedState.sourceName;
      sourcePageRef.current = savedState.sourcePage;
      setItems(itemsRef.current);
      setHasMore(savedState.hasMore);
      setSourceCount(savedState.sourceCount);
      setSourceName(savedState.sourceName);
      setSourcePage(savedState.sourcePage);
      setLoading(false);
      setError("");
      return;
    }

    itemsRef.current = [];
    cursorRef.current = { sourceIndex: 0, page: 1 };
    hasMoreRef.current = true;
    loadingRef.current = false;
    sourceCountRef.current = 0;
    sourceNameRef.current = "";
    sourcePageRef.current = 1;
    setItems([]);
    setHasMore(true);
    setSourceCount(0);
    setSourceName("");
    setSourcePage(1);
    setLoading(true);
    setError("");
    void loadMore();
  }, [category, loadMore]);

  useEffect(() => {
    const container = mainContainerRef?.current;

    const flushScrollPosition = () => {
      if (scrollSaveTimerRef.current !== null) {
        window.clearTimeout(scrollSaveTimerRef.current);
        scrollSaveTimerRef.current = null;
      }
      persistScrollPosition();
    };

    const handleScroll = () => {
      scrollPositionRef.current = Math.max(
        container?.scrollTop ?? 0,
        getPageScrollTop()
      );
      if (scrollSaveTimerRef.current !== null) return;
      scrollSaveTimerRef.current = window.setTimeout(flushScrollPosition, 150);
    };

    container?.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("pagehide", flushScrollPosition);
    return () => {
      container?.removeEventListener("scroll", handleScroll);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("pagehide", flushScrollPosition);
      flushScrollPosition();
    };
  }, [mainContainerRef, persistScrollPosition]);

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
      container.scrollTo({ top: scrollTop, behavior: "auto" });
      window.scrollTo({ top: scrollTop, behavior: "auto" });
      scrollPositionRef.current = scrollTop;
    };

    // Next.js có thể đặt lại vị trí sau khi trang được mount; lần thứ hai giữ
    // lại đúng điểm cũ sau khi thao tác Back hoàn tất.
    const frame = window.requestAnimationFrame(restoreScrollPosition);
    const retryTimer = window.setTimeout(restoreScrollPosition, 180);
    pendingScrollRestoreRef.current = null;
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(retryTimer);
    };
  }, [category, items.length, loading, mainContainerRef]);

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
        rootMargin: "700px 0px",
      }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loading, mainContainerRef]);

  const navigate = (nextCategory: CantoneseCategory) => {
    persistScrollPosition();
    router.push(`/cantonese?category=${nextCategory}`);
  };

  const goBack = () => {
    persistScrollPosition();
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  const initialLoading = loading && items.length === 0;

  return (
    <PageLayout activePath="/cantonese" title="粤语专区">
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
              onClick={() => router.push("/")}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
            >
              <Home className="h-4 w-4" />
              Trang chủ
            </button>
          </div>
          <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
            粤语专区
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Tải dần theo lúc bạn cuộn, quét tới khi hết từng nguồn, chỉ giữ phim
            tiếng Quảng Đông và tự loại tên trùng nhau.
          </p>
        </div>

        <div className="mb-6 flex flex-wrap gap-2" role="tablist">
          {(Object.keys(CATEGORIES) as CantoneseCategory[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={category === key}
              onClick={() => navigate(key)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                category === key
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {CATEGORIES[key]}
            </button>
          ))}
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

        {items.length > 0 && (
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Đã tải {items.length.toLocaleString("vi-VN")} phim
            {hasMore
              ? ` · đang quét ${
                  sourceName || "nguồn phim"
                } (trang ${sourcePage})`
              : ` · đã quét hết ${sourceCount} nguồn`}
          </p>
        )}

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
              priority={index < 6}
              onNavigate={persistScrollPosition}
            />
          ))}
          {loading &&
            Array.from({ length: initialLoading ? 20 : 7 }).map((_, index) => (
              <VideoCardSkeleton key={index} className="w-full" showYear />
            ))}
        </div>

        {!loading && !error && items.length === 0 && !hasMore && (
          <p className="py-12 text-center text-gray-500">
            Chưa tìm thấy nội dung phù hợp.
          </p>
        )}

        <div
          ref={sentinelRef}
          className="flex min-h-16 items-center justify-center"
        >
          {loading && !initialLoading && (
            <span className="inline-flex items-center gap-2 text-sm text-gray-500">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Đang tải thêm…
            </span>
          )}
          {!loading && hasMore && items.length > 0 && (
            <span className="text-sm text-gray-500">Kéo xuống để tải tiếp</span>
          )}
          {!loading && !hasMore && items.length > 0 && (
            <span className="text-sm text-gray-500">
              Đã tải hết nội dung tìm được
            </span>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
