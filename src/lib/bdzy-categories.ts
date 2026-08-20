export interface BdzyCategory {
  id: number;
  name: string;
}

export const HONG_KONG_CATEGORY_ID = 17;
export const HONG_KONG_LANGUAGES = ['粤语', '国语'] as const;
export type HongKongLanguage = (typeof HONG_KONG_LANGUAGES)[number];

export interface BdzyFeaturedCategory extends BdzyCategory {
  language?: HongKongLanguage;
}

export interface BdzyCategorySection {
  name: string;
  categories: BdzyCategory[];
}

/**
 * Các mã dưới đây đã được kiểm tra trực tiếp với BDZY. Chỉ giữ những nhóm
 * có dữ liệu, để menu không xuất hiện các danh mục trống.
 */
export const BDZY_CATEGORY_SECTIONS: BdzyCategorySection[] = [
  {
    name: 'Phim theo thể loại',
    categories: [
      { id: 6, name: 'Hành động' },
      { id: 7, name: 'Hài' },
      { id: 8, name: 'Tình cảm' },
      { id: 9, name: 'Khoa học viễn tưởng' },
      { id: 10, name: 'Kinh dị' },
      { id: 11, name: 'Chính kịch' },
      { id: 12, name: 'Chiến tranh' },
    ],
  },
  {
    name: 'Phim bộ theo khu vực',
    categories: [
      { id: 13, name: 'Phim Trung Quốc' },
      { id: 14, name: 'Phim Âu Mỹ' },
      { id: 15, name: 'Phim Hàn' },
      { id: 16, name: 'Phim Nhật' },
      { id: HONG_KONG_CATEGORY_ID, name: 'Phim Hồng Kông - Macau' },
      { id: 18, name: 'Phim Đài Loan' },
      { id: 19, name: 'Phim Thái' },
      { id: 23, name: 'Phim bộ khác' },
    ],
  },
  {
    name: 'Show & chương trình',
    categories: [
      { id: 25, name: 'Show Trung Quốc' },
      { id: 26, name: 'Show Hàn - Nhật' },
      { id: 27, name: 'Show Hồng Kông - Đài Loan' },
      { id: 28, name: 'Show Âu Mỹ' },
      { id: 48, name: 'Thể thao' },
    ],
  },
  {
    name: 'Hoạt hình',
    categories: [
      { id: 29, name: 'Hoạt hình Trung Quốc' },
      { id: 30, name: 'Anime Nhật' },
      { id: 31, name: 'Hoạt hình Âu Mỹ' },
      { id: 39, name: 'Phim hoạt hình' },
    ],
  },
  {
    name: 'Dành cho thành viên',
    categories: [{ id: 55, name: 'Nội dung 18+' }],
  },
];

export const BDZY_CATEGORIES = BDZY_CATEGORY_SECTIONS.flatMap(
  (section) => section.categories
);

export const BDZY_FEATURED_CATEGORIES = [
  { id: HONG_KONG_CATEGORY_ID, name: 'Phim Hồng Kông', language: '粤语' },
  { id: 6, name: 'Hành động' },
  { id: 15, name: 'Phim Hàn' },
  { id: 14, name: 'Phim Âu Mỹ' },
  { id: 30, name: 'Anime Nhật' },
  { id: 25, name: 'Show Trung Quốc' },
  { id: 48, name: 'Thể thao' },
] satisfies BdzyFeaturedCategory[];

export function isBdzyCategoryId(value: number): boolean {
  return BDZY_CATEGORIES.some((category) => category.id === value);
}
