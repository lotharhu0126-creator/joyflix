/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console */

'use client';

import { ChevronRight, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation'; // 添加 usePathname
import { Suspense, useEffect, useState } from 'react';

import ConfirmationDialog from '@/components/ConfirmationDialog';

import {
  BangumiCalendarData,
  GetBangumiCalendarData,
} from '@/lib/bangumi.client';
import { clearScrollCache } from '@/lib/scrollCache'; // 导入 clearScrollCache
import { useHomepageScrollRestoration } from '@/lib/useHomepageScrollRestoration';
// 客户端收藏 API
import {
  clearAllFavorites,
  getAllFavorites,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { getDoubanCategories, getDoubanList } from '@/lib/douban.client';
import { canPlayHlsInBrowser } from '@/lib/hls-playability.client';
import { DoubanItem, SearchResult } from '@/lib/types';

import CapsuleSwitch from '@/components/CapsuleSwitch';
import ContinueWatching from '@/components/ContinueWatching';
import PageLayout from '@/components/PageLayout';
import ScrollableRow from '@/components/ScrollableRow';
import { useSite } from '@/components/SiteProvider';
import VideoCard from '@/components/VideoCard';
import VideoCardSkeleton from '@/components/VideoCardSkeleton';

function HomeClient() {
  const { mainContainerRef } = useSite();
  const router = useRouter();
  const pathname = usePathname(); // Get current pathname
  if (mainContainerRef) {
    useHomepageScrollRestoration(mainContainerRef);
  }
  const [activeTab, setActiveTab] = useState<'home' | 'favorites'>('home');
  const [hotMovies, setHotMovies] = useState<DoubanItem[]>([]);
  const [hotTvShows, setHotTvShows] = useState<DoubanItem[]>([]);
  const [hotVarietyShows, setHotVarietyShows] = useState<DoubanItem[]>([]);
  const [hongKongTvShows, setHongKongTvShows] = useState<DoubanItem[]>([]);
  const [hotCustomCategory, setHotCustomCategory] = useState<DoubanItem[]>([]);
  const [isMoviesLoading, setIsMoviesLoading] = useState(true);
  const [isTvShowsLoading, setIsTvShowsLoading] = useState(true);
  const [isVarietyShowsLoading, setIsVarietyShowsLoading] = useState(true);
  const [isHongKongTvLoading, setIsHongKongTvLoading] = useState(true);
  const [isCustomCategoryLoading, setIsCustomCategoryLoading] = useState(true);
  const [isBangumiLoading, setIsBangumiLoading] = useState(true);
  const [isFavoritesLoading, setIsFavoritesLoading] = useState(false);
  const [westernItems, setWesternItems] = useState<SearchResult[]>([]);
  const [isWesternLoading, setIsWesternLoading] = useState(true);
  const [cantoneseRows, setCantoneseRows] = useState<
    Record<'series' | 'movie', SearchResult[]>
  >({ series: [], movie: [] });
  const [isCantoneseLoading, setIsCantoneseLoading] = useState(true);
  const [bangumiCalendarData, setBangumiCalendarData] = useState<
    BangumiCalendarData[]
  >([]);
  const { announcement } = useSite();

  const [showAnnouncement, setShowAnnouncement] = useState(false);

  // 检查公告弹窗状态
  useEffect(() => {
    if (typeof window !== 'undefined' && announcement) {
      const hasSeenAnnouncement = localStorage.getItem('hasSeenAnnouncement');
      if (hasSeenAnnouncement !== announcement) {
        setShowAnnouncement(true);
      } else {
        setShowAnnouncement(Boolean(!hasSeenAnnouncement && announcement));
      }
    }
  }, [announcement]);

  // 当导航到首页时清除豆瓣页面的滚动缓存
  useEffect(() => {
    if (pathname === '/') {
      clearScrollCache('/douban');
    }
  }, [pathname]);

  // 收藏数据
  type FavoriteItem = {
    id: string;
    source: string;
    title: string;
    poster: string;
    episodes: number;
    source_name: string;
    currentEpisode?: number;
    search_title?: string;
    douban_id?: number; // 添加 douban_id
  };

  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);

  useEffect(() => {
    let active = true;

    // Mỗi hàng tự hiển thị ngay khi API của chính nó hoàn thành; không để
    // một nguồn chậm giữ lại toàn bộ trang chủ.
    void getDoubanCategories({
      kind: 'movie',
      category: '热门',
      type: '全部',
    })
      .then((data) => {
        if (active && data.code === 200) setHotMovies(data.list);
      })
      .catch((error) => console.error('获取热门电影失败:', error))
      .finally(() => {
        if (active) setIsMoviesLoading(false);
      });

    void getDoubanCategories({ kind: 'tv', category: 'tv', type: 'tv' })
      .then((data) => {
        if (active && data.code === 200) setHotTvShows(data.list);
      })
      .catch((error) => console.error('获取热门剧集失败:', error))
      .finally(() => {
        if (active) setIsTvShowsLoading(false);
      });

    void getDoubanCategories({ kind: 'tv', category: 'show', type: 'show' })
      .then((data) => {
        if (active && data.code === 200) setHotVarietyShows(data.list);
      })
      .catch((error) => console.error('获取热门综艺失败:', error))
      .finally(() => {
        if (active) setIsVarietyShowsLoading(false);
      });

    void getDoubanList({
      tag: '港剧',
      type: 'tv',
      pageLimit: 20,
      pageStart: 0,
    })
      .then((data) => {
        if (active && data.code === 200) setHongKongTvShows(data.list);
      })
      .catch((error) => console.error('获取港剧失败:', error))
      .finally(() => {
        if (active) setIsHongKongTvLoading(false);
      });

    void getDoubanList({
      tag: '华语',
      type: 'movie',
      pageLimit: 25,
      pageStart: 0,
    })
      .then((data) => {
        if (active && data.code === 200) setHotCustomCategory(data.list);
      })
      .catch((error) => console.error('获取华语电影失败:', error))
      .finally(() => {
        if (active) setIsCustomCategoryLoading(false);
      });

    void GetBangumiCalendarData()
      .then((data) => {
        if (active) setBangumiCalendarData(data);
      })
      .catch((error) => console.error('获取每日新番失败:', error))
      .finally(() => {
        if (active) setIsBangumiLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/western-catalog?limit=20', { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Không thể tải phim Âu Mỹ');
        }
        const candidates = Array.isArray(data.items) ? data.items : [];
        const checks = await Promise.all(
          candidates.map(async (item: SearchResult) => {
            const isPlayable = await canPlayHlsInBrowser(
              item.episodes[0],
              controller.signal
            );
            return isPlayable ? item : null;
          })
        );
        if (!controller.signal.aborted) {
          setWesternItems(
            checks.filter((item): item is SearchResult => item !== null)
          );
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.warn('Không thể tải phim Âu Mỹ đã kiểm tra phát:', error);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsWesternLoading(false);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const categories = ['series', 'movie'] as const;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshAttempts = 0;

    const fetchCantoneseRows = async () => {
      try {
        const rows = await Promise.all(
          categories.map(async (category) => {
            const response = await fetch(
              `/api/cantonese-catalog?category=${category}&page=1`,
              { signal: controller.signal }
            );
            if (!response.ok) {
              return { category, items: [], isPreview: false };
            }
            const data = await response.json();
            return {
              category,
              items: data.items || [],
              isPreview: Boolean(data.isPreview),
            };
          })
        );
        if (!controller.signal.aborted) {
          setCantoneseRows(
            Object.fromEntries(
              rows.map(({ category, items }) => [category, items])
            ) as Record<'series' | 'movie', SearchResult[]>
          );
          if (rows.some(({ isPreview }) => isPreview) && refreshAttempts < 6) {
            refreshAttempts += 1;
            refreshTimer = setTimeout(() => {
              void fetchCantoneseRows();
            }, 6000);
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn('Không thể tải danh mục 粤语:', error);
        }
      } finally {
        if (!controller.signal.aborted) setIsCantoneseLoading(false);
      }
    };

    fetchCantoneseRows();
    return () => {
      controller.abort();
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, []);

  // 处理收藏数据更新的函数
  const updateFavoriteItems = async (allFavorites: Record<string, any>) => {
    const allPlayRecords = await getAllPlayRecords();

    // 根据保存时间排序（从近到远）
    const sorted = Object.entries(allFavorites)
      .sort(([, a], [, b]) => b.save_time - a.save_time)
      .map(([key, fav]) => {
        const plusIndex = key.indexOf('+');
        const source = key.slice(0, plusIndex);
        const id = key.slice(plusIndex + 1);

        // 查找对应的播放记录，获取当前集数
        const playRecord = allPlayRecords[key];
        const currentEpisode = playRecord?.index;

        return {
          id,
          source,
          title: fav.title,
          year: fav.year,
          poster: fav.cover,
          episodes: fav.total_episodes,
          source_name: fav.source_name,
          currentEpisode,
          search_title: fav?.search_title,
          douban_id: fav.doubanId ? Number(fav.doubanId) : undefined, // 添加 douban_id
        } as FavoriteItem;
      });
    setFavoriteItems(sorted);
  };

  // 当切换到收藏时加载收藏数据
  useEffect(() => {
    if (activeTab !== 'favorites') return;

    const loadFavorites = async () => {
      setIsFavoritesLoading(true);
      try {
        const allFavorites = await getAllFavorites();
        await updateFavoriteItems(allFavorites);
      } finally {
        setIsFavoritesLoading(false);
      }
    };

    loadFavorites();

    // 监听收藏更新事件
    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (newFavorites: Record<string, any>) => {
        updateFavoriteItems(newFavorites);
      }
    );

    return unsubscribe;
  }, [activeTab]);

  const handleCloseAnnouncement = (announcement: string) => {
    setShowAnnouncement(false);
    localStorage.setItem('hasSeenAnnouncement', announcement); // 记录已查看弹窗
  };

  return (
    <PageLayout>
      <div className="px-2 sm:px-10 py-4 sm:py-8 overflow-x-hidden">
        {/* 顶部 Tab 切换 */}
        <div className="mb-8 flex justify-center">
          <CapsuleSwitch
            options={[
              { label: '首页', value: 'home' },
              { label: '收藏', value: 'favorites' },
            ]}
            active={activeTab}
            onChange={(value) => setActiveTab(value as 'home' | 'favorites')}
          />
        </div>

        <div className="max-w-[96%] mx-auto">
          {activeTab === 'favorites' ? (
            // 收藏视图
            <section className="mb-8">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">
                  收藏列表
                </h2>
                {favoriteItems.length > 0 && (
                  <button
                    onClick={async () => {
                      await clearAllFavorites();
                      setFavoriteItems([]);
                    }}
                  >
                    <Trash2
                      size={20}
                      className="text-gray-500 dark:text-gray-400 transition-all duration-300 ease-out hover:stroke-red-500 hover:scale-[1.1]"
                    />
                  </button>
                )}
              </div>
              <div className="justify-start grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8">
                {isFavoritesLoading
                  ? // 加载状态显示灰色占位数据
                    Array.from({ length: 12 }).map((_, index) => (
                      <VideoCardSkeleton
                        key={index}
                        className="w-full"
                        showYear={false}
                      />
                    ))
                  : favoriteItems.map((item) => (
                      <div key={item.id + item.source} className="w-full">
                        <VideoCard
                          query={item.search_title}
                          {...item}
                          from="favorite"
                          type={item.episodes > 1 ? 'tv' : ''}
                        />
                      </div>
                    ))}
                {!isFavoritesLoading && favoriteItems.length === 0 && (
                  <div className="col-span-full text-center text-gray-500 py-8 dark:text-gray-400">
                    暂无收藏
                  </div>
                )}
              </div>
            </section>
          ) : (
            // 首页视图
            <>
              {/* 继续观看 */}
              <ContinueWatching />

              {/* Âu Mỹ: gộp nguồn JoyFlix và BDZY, chỉ nhận stream đã kiểm tra. */}
              {(isWesternLoading || westernItems.length > 0) && (
                <section className="mb-8">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="flex items-center text-xl font-bold text-gray-800 dark:text-gray-200">
                      Phim Âu Mỹ
                    </h2>
                    <button
                      type="button"
                      onClick={() => router.push('/western?page=1')}
                      className="inline-flex items-center text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      Xem thêm
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </button>
                  </div>
                  <ScrollableRow>
                    {isWesternLoading
                      ? Array.from({ length: 8 }).map((_, index) => (
                          <VideoCardSkeleton
                            key={index}
                            className="min-w-[96px] w-24 sm:min-w-[180px] sm:w-44"
                            showYear
                          />
                        ))
                      : westernItems.map((item, index) => (
                          <div
                            key={`${item.source}-${item.id}`}
                            className="min-w-[96px] w-24 sm:min-w-[180px] sm:w-44"
                          >
                            <VideoCard
                              id={item.id}
                              title={item.title}
                              poster={item.poster}
                              episodes={item.episodes.length}
                              source={item.source}
                              source_name={item.source_name}
                              year={item.year}
                              from="search"
                              priority={index < 4}
                            />
                          </div>
                        ))}
                  </ScrollableRow>
                </section>
              )}

              {/* 粤语专区：gộp mọi nguồn VOD đang bật, phân loại theo số tập. */}
              <section className="mb-8">
                <div className="mb-4 flex items-center justify-between">
                  <h2
                    onClick={() =>
                      router.push('/cantonese?category=series&page=1')
                    }
                    className="flex cursor-pointer items-center text-xl font-bold text-gray-800 transition-transform duration-200 hover:scale-[1.02] hover:text-gray-900 dark:text-gray-200 dark:hover:text-white"
                  >
                    粤语专区
                    <ChevronRight className="ml-1 h-5 w-5" />
                  </h2>
                </div>
                <div className="space-y-8">
                  {(
                    [
                      ['series', '港澳剧'],
                      ['movie', '港澳电影'],
                    ] as const
                  ).map(([category, label]) => (
                    <section key={category}>
                      <button
                        type="button"
                        onClick={() =>
                          router.push(`/cantonese?category=${category}&page=1`)
                        }
                        className="mb-3 flex items-center text-base font-semibold text-gray-700 hover:text-blue-500 dark:text-gray-300 dark:hover:text-blue-300"
                      >
                        {label}
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </button>
                      <ScrollableRow>
                        {isCantoneseLoading
                          ? Array.from({ length: 6 }).map((_, index) => (
                              <VideoCardSkeleton
                                key={index}
                                className="min-w-[96px] w-24 sm:min-w-[180px] sm:w-44"
                                showYear
                              />
                            ))
                          : cantoneseRows[category].map((item, index) => (
                              <div
                                key={`${item.source}-${item.id}`}
                                className="min-w-[96px] w-24 sm:min-w-[180px] sm:w-44"
                              >
                                <VideoCard
                                  id={item.id}
                                  title={item.title}
                                  poster={item.poster}
                                  episodes={item.episodes.length}
                                  source={item.source}
                                  source_name={item.source_name}
                                  year={item.year}
                                  from="search"
                                  priority={category === 'series' && index < 4}
                                />
                              </div>
                            ))}
                      </ScrollableRow>
                    </section>
                  ))}
                </div>
              </section>

              {/* 港剧：JoyFlix 原有的 Douban 自定义分类。 */}
              <section className="mb-8">
                <div className="mb-4 flex items-center justify-between">
                  <h2
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent('clearHomepageScroll')
                      );
                      router.push('/douban?type=custom&tag=%E6%B8%AF%E5%89%A7');
                    }}
                    className="flex cursor-pointer items-center text-xl font-bold text-gray-800 transition-transform duration-200 hover:scale-[1.02] hover:text-gray-900 dark:text-gray-200 dark:hover:text-white"
                  >
                    港剧
                    <ChevronRight className="ml-1 h-5 w-5" />
                  </h2>
                </div>
                <ScrollableRow>
                  {isHongKongTvLoading
                    ? Array.from({ length: 8 }).map((_, index) => (
                        <VideoCardSkeleton
                          key={index}
                          className="min-w-[96px] w-24 sm:min-w-[180px] sm:w-44"
                          showYear
                        />
                      ))
                    : hongKongTvShows.map((show, index) => (
                        <div
                          key={show.id}
                          className="min-w-[96px] w-24 sm:min-w-[180px] sm:w-44"
                        >
                          <VideoCard
                            from="douban"
                            title={show.title}
                            poster={show.poster}
                            douban_id={Number(show.id)}
                            rate={show.rate}
                            year={show.year}
                            priority={index < 4}
                          />
                        </div>
                      ))}
                </ScrollableRow>
              </section>

              {/* 热门电影 */}
              <section className="mb-8">
                <div className="mb-4 flex items-center justify-between">
                  <h2
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent('clearHomepageScroll')
                      );
                      router.push('/douban?type=movie');
                    }}
                    className="text-xl font-bold text-gray-800 dark:text-gray-200 flex items-center cursor-pointer hover:text-gray-900 dark:hover:text-white hover:scale-[1.02] transition-transform duration-200"
                  >
                    热门电影
                    <ChevronRight className="w-5 h-5 ml-1" />
                  </h2>
                </div>
                <ScrollableRow>
                  {isMoviesLoading
                    ? // 加载状态显示灰色占位数据
                      Array.from({ length: 8 }).map((_, index) => (
                        <VideoCardSkeleton
                          key={index}
                          className="min-w-[96px] w-24 sm:min-w-[180px] sm:w-44"
                          showYear={true}
                        />
                      ))
                    : // 显示真实数据
                      hotMovies.map((movie, index) => (
                        <div
                          key={index}
                          className="min-w-[96px] w-24 sm:min-w-[180px] sm:w-44"
                        >
                          <VideoCard
                            from="douban"
                            title={movie.title}
                            poster={movie.poster}
                            douban_id={Number(movie.id)}
                            rate={movie.rate}
                            year={movie.year}
                            type="movie"
                            priority={index < 4}
                          />
                        </div>
                      ))}
                </ScrollableRow>
              </section>

              {/* 热门剧集 */}
              <section className="mb-8">
                <div className="mb-4 flex items-center justify-between">
                  <h2
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent('clearHomepageScroll')
                      );
                      router.push('/douban?type=tv');
                    }}
                    className="text-xl font-bold text-gray-800 dark:text-gray-200 flex items-center cursor-pointer hover:text-gray-900 dark:hover:text-white hover:scale-[1.02] transition-transform duration-200"
                  >
                    热门剧集
                    <ChevronRight className="w-5 h-5 ml-1" />
                  </h2>
                </div>
                <ScrollableRow>
                  {isTvShowsLoading
                    ? // 加载状态显示灰色占位数据
                      Array.from({ length: 8 }).map((_, index) => (
                        <VideoCardSkeleton
                          key={index}
                          className="min-w-[96px] w-24 sm:min-w-[180px] sm:w-44"
                          showYear={true}
                        />
                      ))
                    : // 显示真实数据
                      hotTvShows.map((show, index) => (
                        <div
                          key={index}
                          className="min-w-[96px] w-24 sm:min-w-[180px] sm:w-44"
                        >
                          <VideoCard
                            from="douban"
                            title={show.title}
                            poster={show.poster}
                            douban_id={Number(show.id)}
                            rate={show.rate}
                            year={show.year}
                          />
                        </div>
                      ))}
                </ScrollableRow>
              </section>

              {/* 每日新番放送 */}
              <section className="mb-8">
                <div className="mb-4 flex items-center justify-between">
                  <h2
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent('clearHomepageScroll')
                      );
                      router.push('/douban?type=anime');
                    }}
                    className="text-xl font-bold text-gray-800 dark:text-gray-200 flex items-center cursor-pointer hover:text-gray-900 dark:hover:text-white hover:scale-[1.02] transition-transform duration-200"
                  >
                    热门番剧
                    <ChevronRight className="w-5 h-5 ml-1" />
                  </h2>
                </div>
                <ScrollableRow>
                  {isBangumiLoading
                    ? // 加载状态显示灰色占位数据
                      Array.from({ length: 8 }).map((_, index) => (
                        <VideoCardSkeleton
                          key={index}
                          className="min-w-[96px] w-24 sm:min-w-[180px] sm:w-44"
                          showYear={true}
                        />
                      ))
                    : // 展示当前日期的番剧
                      (() => {
                        // 获取当前日期对应的星期
                        const today = new Date();
                        const weekdays = [
                          'Sun',
                          'Mon',
                          'Tue',
                          'Wed',
                          'Thu',
                          'Fri',
                          'Sat',
                        ];
                        const currentWeekday = weekdays[today.getDay()];

                        // 找到当前星期对应的番剧数据
                        const todayAnimes =
                          bangumiCalendarData.find(
                            (item) => item.weekday.en === currentWeekday
                          )?.items || [];

                        return todayAnimes.map((anime, index) => (
                          <div
                            key={`${anime.id}-${index}`}
                            className="min-w-[96px] w-24 sm:min-w-[180px] sm:w-44"
                          >
                            <VideoCard
                              from="douban"
                              title={anime.name_cn || anime.name}
                              poster={
                                anime.images?.large ||
                                anime.images?.common ||
                                anime.images?.medium ||
                                anime.images?.small ||
                                anime.images?.grid
                              }
                              douban_id={anime.id}
                              rate={anime.rating?.score?.toString() || ''}
                              year={anime.air_date?.split('-')?.[0] || ''}
                              isBangumi={true}
                            />
                          </div>
                        ));
                      })()}
                </ScrollableRow>
              </section>

              {/* 热门综艺 */}
              <section className="mb-8">
                <div className="mb-4 flex items-center justify-between">
                  <h2
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent('clearHomepageScroll')
                      );
                      router.push('/douban?type=show');
                    }}
                    className="text-xl font-bold text-gray-800 dark:text-gray-200 flex items-center cursor-pointer hover:text-gray-900 dark:hover:text-white hover:scale-[1.02] transition-transform duration-200"
                  >
                    热门综艺
                    <ChevronRight className="w-5 h-5 ml-1" />
                  </h2>
                </div>
                <ScrollableRow>
                  {isVarietyShowsLoading
                    ? // 加载状态显示灰色占位数据
                      Array.from({ length: 8 }).map((_, index) => (
                        <VideoCardSkeleton
                          key={index}
                          className="min-w-[96px] w-24 sm:min-w-[180px] sm:w-44"
                          showYear={true}
                        />
                      ))
                    : // 显示真实数据
                      hotVarietyShows.map((show, index) => (
                        <div
                          key={index}
                          className="min-w-[96px] w-24 sm:min-w-[180px] sm:w-44"
                        >
                          <VideoCard
                            from="douban"
                            title={show.title}
                            poster={show.poster}
                            douban_id={Number(show.id)}
                            rate={show.rate}
                            year={show.year}
                          />
                        </div>
                      ))}
                </ScrollableRow>
              </section>

              {/* 更多热门 */}
              <section className="mb-8">
                <div className="mb-4 flex items-center justify-between">
                  <h2
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent('clearHomepageScroll')
                      );
                      router.push('/douban?type=custom');
                    }}
                    className="text-xl font-bold text-gray-800 dark:text-gray-200 flex items-center cursor-pointer hover:text-gray-900 dark:hover:text-white hover:scale-[1.02] transition-transform duration-200"
                  >
                    更多热门
                    <ChevronRight className="w-5 h-5 ml-1" />
                  </h2>
                </div>
                <ScrollableRow>
                  {isCustomCategoryLoading
                    ? // 加载状态显示灰色占位数据
                      Array.from({ length: 8 }).map((_, index) => (
                        <VideoCardSkeleton
                          key={index}
                          className="min-w-[96px] w-24 sm:min-w-[180px] sm:w-44"
                          showYear={true}
                        />
                      ))
                    : // 显示真实数据
                      hotCustomCategory.map((show, index) => (
                        <div
                          key={index}
                          className="min-w-[96px] w-24 sm:min-w-[180px] sm:w-44"
                        >
                          <VideoCard
                            from="douban"
                            title={show.title}
                            poster={show.poster}
                            douban_id={Number(show.id)}
                            rate={show.rate}
                            year={show.year}
                          />
                        </div>
                      ))}
                </ScrollableRow>
              </section>
            </>
          )}
        </div>
      </div>
      {announcement && (
        <ConfirmationDialog
          isOpen={showAnnouncement}
          onClose={() => handleCloseAnnouncement(announcement)}
          onConfirm={() => handleCloseAnnouncement(announcement)}
          title="提示"
          message={announcement}
          showCancelButton={false}
        />
      )}
    </PageLayout>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeClient />
    </Suspense>
  );
}
