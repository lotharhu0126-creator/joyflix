'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Home } from 'lucide-react';

import PageLayout from '@/components/PageLayout';
import { useSite } from '@/components/SiteProvider';
import VideoCard from '@/components/VideoCard';
import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import {
  BDZY_CATEGORIES,
  BDZY_CATEGORY_SECTIONS,
  BdzyCategory,
  HONG_KONG_CATEGORY_ID,
  HONG_KONG_LANGUAGES,
  HongKongLanguage,
} from '@/lib/bdzy-categories';
import { SearchResult } from '@/lib/types';

const DEFAULT_CATEGORY = BDZY_CATEGORIES.find((category) => category.id === 6)!;
const SOURCE_PAGE_STATE_KEY = 'joyflix-bdzy-page-state';

interface SourcePageState {
  categoryId: number;
  hongKongLanguage: HongKongLanguage | null;
  page: number;
  pageCount: number;
  total: number;
  items: SearchResult[];
  scrollPosition: number;
}

function getSavedPageState(): SourcePageState | null {
  try {
    const rawState = sessionStorage.getItem(SOURCE_PAGE_STATE_KEY);
    return rawState ? (JSON.parse(rawState) as SourcePageState) : null;
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

export default function SourcePage() {
  const { mainContainerRef } = useSite();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [canViewAdult] = useState(
    () =>
      typeof window !== 'undefined' &&
      Boolean(getAuthInfoFromBrowserCookie()?.username)
  );
  const visibleCategories = canViewAdult
    ? BDZY_CATEGORIES
    : BDZY_CATEGORIES.filter((category) => category.id !== 55);
  const requestedCategoryId = Number(searchParams.get('category'));
  const requestedCategory = visibleCategories.find(
    (category) => category.id === requestedCategoryId
  );
  const requestedLanguage = searchParams.get('language');
  const requestedHongKongLanguage = HONG_KONG_LANGUAGES.includes(
    requestedLanguage as HongKongLanguage
  )
    ? (requestedLanguage as HongKongLanguage)
    : null;
  const [savedPageState] = useState<SourcePageState | null>(() =>
    typeof window === 'undefined'
      ? null
      : (() => {
          if (requestedCategory) return null;
          const state = getSavedPageState();
          return !canViewAdult && state?.categoryId === 55 ? null : state;
        })()
  );
  const savedCategory =
    requestedCategory ||
    visibleCategories.find(
      (category) => category.id === savedPageState?.categoryId
    );
  const [selectedCategory, setSelectedCategory] = useState(
    savedCategory || DEFAULT_CATEGORY
  );
  const [hongKongLanguage, setHongKongLanguage] =
    useState<HongKongLanguage | null>(
      (savedCategory || DEFAULT_CATEGORY).id === HONG_KONG_CATEGORY_ID
        ? requestedHongKongLanguage ||
            savedPageState?.hongKongLanguage ||
            HONG_KONG_LANGUAGES[0]
        : null
    );
  const [items, setItems] = useState<SearchResult[]>(
    savedPageState?.items || []
  );
  const [page, setPage] = useState(savedPageState?.page || 1);
  const [pageCount, setPageCount] = useState(savedPageState?.pageCount || 0);
  const [total, setTotal] = useState(savedPageState?.total || 0);
  const [pageInput, setPageInput] = useState(String(savedPageState?.page || 1));
  const [loading, setLoading] = useState(!savedPageState);
  const [error, setError] = useState('');
  const restoredOnMountRef = useRef(false);

  const getScrollContainer = useCallback(() => {
    if (window.innerWidth < 768) return document.scrollingElement;
    return mainContainerRef?.current;
  }, [mainContainerRef]);

  const savePageState = useCallback(() => {
    try {
      const scrollContainer = getScrollContainer();
      const state: SourcePageState = {
        categoryId: selectedCategory.id,
        hongKongLanguage:
          selectedCategory.id === HONG_KONG_CATEGORY_ID
            ? hongKongLanguage
            : null,
        page,
        pageCount,
        total,
        items,
        scrollPosition: scrollContainer?.scrollTop || 0,
      };
      sessionStorage.setItem(SOURCE_PAGE_STATE_KEY, JSON.stringify(state));
    } catch {
      // The page remains usable when session storage is unavailable.
    }
  }, [
    getScrollContainer,
    hongKongLanguage,
    items,
    page,
    pageCount,
    selectedCategory.id,
    total,
  ]);

  const goBack = () => {
    savePageState();
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  const goHome = () => {
    savePageState();
    router.push('/');
  };

  useEffect(() => {
    if (savedPageState && !restoredOnMountRef.current) {
      restoredOnMountRef.current = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const scrollContainer = getScrollContainer();
          if (scrollContainer) {
            scrollContainer.scrollTop = savedPageState.scrollPosition;
          }
        });
      });
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError('');
    const query = new URLSearchParams({
      typeId: String(selectedCategory.id),
      page: String(page),
    });
    if (selectedCategory.id === HONG_KONG_CATEGORY_ID && hongKongLanguage) {
      query.set('language', hongKongLanguage);
    }

    fetch(`/api/source-categories?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || 'Không thể tải danh mục');
        setItems(data.items || []);
        setPageCount(data.pageCount || 0);
        setTotal(data.total || 0);
      })
      .catch((requestError) => {
        if (
          requestError instanceof Error &&
          requestError.name !== 'AbortError'
        ) {
          setError(requestError.message);
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [
    getScrollContainer,
    hongKongLanguage,
    page,
    savedPageState,
    selectedCategory.id,
  ]);

  const selectCategory = (category: BdzyCategory) => {
    setSelectedCategory(category);
    setHongKongLanguage(
      category.id === HONG_KONG_CATEGORY_ID ? HONG_KONG_LANGUAGES[0] : null
    );
    setPage(1);
  };

  const selectHongKongLanguage = (language: HongKongLanguage) => {
    if (hongKongLanguage === language) return;
    setHongKongLanguage(language);
    setPage(1);
  };

  const goToPage = useCallback(
    (requestedPage: number) => {
      if (!Number.isInteger(requestedPage) || pageCount < 1) return;
      const nextPage = Math.min(Math.max(requestedPage, 1), pageCount);
      setPage(nextPage);
      getScrollContainer()?.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [getScrollContainer, pageCount]
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

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  const visiblePages = getVisiblePages(page, pageCount);

  return (
    <PageLayout activePath="/source" title="Khám phá">
      <div className="mx-auto w-full max-w-7xl px-4 pb-8 pt-20 md:px-8">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
              Khám phá phim
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Thể loại được bổ sung từ kho BDZY và hiển thị theo giao diện
              JoyFlix.
            </p>
          </div>
          <div className="flex items-center gap-2">
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
              onClick={goHome}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
            >
              <Home className="h-4 w-4" />
              Trang chủ
            </button>
          </div>
        </div>
        <div className="mb-8 grid gap-4 md:grid-cols-2">
          {BDZY_CATEGORY_SECTIONS.map((section) => {
            const categories = section.categories.filter(
              (category) => canViewAdult || category.id !== 55
            );
            if (categories.length === 0) return null;
            return (
              <section
                key={section.name}
                className="rounded-xl border border-gray-200/70 bg-white/50 p-4 shadow-sm backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/30"
              >
                <h2 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">
                  {section.name}
                </h2>
                <div className="columns-2 gap-2 sm:columns-3">
                  {categories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => selectCategory(category)}
                      aria-pressed={selectedCategory.id === category.id}
                      className={`mb-2 block w-full break-inside-avoid rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        selectedCategory.id === category.id
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        {selectedCategory.id === HONG_KONG_CATEGORY_ID && (
          <section
            className="mb-8 rounded-xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900/70 dark:bg-blue-950/20"
            aria-label="Ngôn ngữ phim Hồng Kông"
          >
            <h2 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">
              Phim Hồng Kông
            </h2>
            <div className="flex flex-wrap gap-2" role="tablist">
              {HONG_KONG_LANGUAGES.map((language) => (
                <button
                  key={language}
                  type="button"
                  role="tab"
                  aria-selected={hongKongLanguage === language}
                  onClick={() => selectHongKongLanguage(language)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    hongKongLanguage === language
                      ? 'bg-blue-500 text-white'
                      : 'bg-white text-gray-700 hover:bg-blue-100 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
                  }`}
                >
                  {language}
                </button>
              ))}
            </div>
          </section>
        )}
        {error && (
          <p className="rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}
        {loading && (
          <p className="py-12 text-center text-gray-500">Đang tải…</p>
        )}
        {!loading && !error && items.length === 0 && (
          <p className="py-12 text-center text-gray-500">
            BDZY hiện chưa trả nội dung cho danh mục này.
          </p>
        )}
        {!loading && !error && items.length > 0 && (
          <>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              Hiển thị {items.length} / {total.toLocaleString('vi-VN')} nội dung
              của danh mục {selectedCategory.name}
              {hongKongLanguage ? ` · ${hongKongLanguage}` : ''}.
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
            aria-label="Phân trang danh mục BDZY"
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
            <form
              onSubmit={handlePageSubmit}
              className="flex items-center gap-2"
            >
              <label htmlFor="bdzy-page" className="sr-only">
                Nhập số trang
              </label>
              <input
                id="bdzy-page"
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
