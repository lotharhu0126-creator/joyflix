'use client';

import { ArrowLeft, ChevronLeft, ChevronRight, Home } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';
import VideoCardSkeleton from '@/components/VideoCardSkeleton';
import { SearchResult } from '@/lib/types';

const CATEGORIES = {
  series: '港澳剧',
  movie: '港澳电影',
} as const;

type CantoneseCategory = keyof typeof CATEGORIES;

function getVisiblePages(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: Array<number | 'ellipsis'> = [1];
  const start = Math.max(2, currentPage - 2);
  const end = Math.min(totalPages - 1, currentPage + 2);

  if (start > 2) pages.push('ellipsis');
  for (let page = start; page <= end; page += 1) pages.push(page);
  if (end < totalPages - 1) pages.push('ellipsis');
  pages.push(totalPages);

  return pages;
}

export default function CantonesePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedCategory = searchParams.get('category');
  const category: CantoneseCategory =
    requestedCategory === 'movie' ? 'movie' : 'series';
  const requestedPage = Number(searchParams.get('page') || '1');
  const page =
    Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const [items, setItems] = useState<SearchResult[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [sourceCount, setSourceCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshAttempts = 0;
    setLoading(true);
    setError('');

    const fetchCatalog = async () => {
      try {
        const response = await fetch(
          `/api/cantonese-catalog?category=${category}&page=${page}`,
          { signal: controller.signal }
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Không thể tải danh mục');
        }
        if (controller.signal.aborted) return;
        setItems(data.items || []);
        setPageCount(data.pageCount || 0);
        setTotal(data.total || 0);
        setSourceCount(data.sourceCount || 0);
        if (data.isPreview && refreshAttempts < 6) {
          refreshAttempts += 1;
          refreshTimer = setTimeout(() => {
            void fetchCatalog();
          }, 6000);
        }
      } catch (requestError) {
        if (
          requestError instanceof Error &&
          requestError.name !== 'AbortError'
        ) {
          setError(requestError.message);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void fetchCatalog();

    return () => {
      controller.abort();
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [category, page]);

  const navigate = (nextCategory: CantoneseCategory, nextPage = 1) => {
    const query = new URLSearchParams({
      category: nextCategory,
      page: String(nextPage),
    });
    router.push(`/cantonese?${query}`);
  };

  const goBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  const visiblePages = useMemo(
    () => getVisiblePages(page, pageCount),
    [page, pageCount]
  );

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
              onClick={() => router.push('/')}
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
            Tổng hợp từ mọi nguồn đang bật, chỉ giữ phim có tiếng Quảng Đông và
            tự loại các tên trùng nhau.
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
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {CATEGORIES[key]}
            </button>
          ))}
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}
        {loading && (
          <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
            {Array.from({ length: 20 }).map((_, index) => (
              <VideoCardSkeleton key={index} className="w-full" showYear />
            ))}
          </div>
        )}
        {!loading && !error && items.length === 0 && (
          <p className="py-12 text-center text-gray-500">
            Chưa tìm thấy nội dung phù hợp.
          </p>
        )}
        {!loading && !error && items.length > 0 && (
          <>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              Hiển thị {items.length} / {total.toLocaleString('vi-VN')} nội dung
              từ {sourceCount} nguồn.
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
                  priority={index < 6}
                />
              ))}
            </div>
          </>
        )}

        {!loading && !error && pageCount > 1 && (
          <nav
            className="mt-8 flex flex-wrap items-center justify-center gap-2"
            aria-label="Phân trang danh mục 粤语"
          >
            <button
              type="button"
              disabled={page === 1}
              onClick={() => navigate(category, page - 1)}
              className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800"
            >
              <ChevronLeft className="h-4 w-4" /> Trước
            </button>
            {visiblePages.map((pageNumber, index) =>
              pageNumber === 'ellipsis' ? (
                <span
                  key={`ellipsis-${index}`}
                  className="px-1 text-gray-500"
                  aria-hidden="true"
                >
                  …
                </span>
              ) : (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => navigate(category, pageNumber)}
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
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => navigate(category, page + 1)}
              className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800"
            >
              Sau <ChevronRight className="h-4 w-4" />
            </button>
          </nav>
        )}
      </div>
    </PageLayout>
  );
}
