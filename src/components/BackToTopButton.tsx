'use client';

import { ChevronUp } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useSite } from './SiteProvider';

export function BackToTopButton() {
  const { mainContainerRef } = useSite();
  const [isVisible, setIsVisible] = useState(false);

  const handleScroll = useCallback(() => {
    if (mainContainerRef && mainContainerRef.current) {
      const { scrollTop } = mainContainerRef.current;
      // Hiển thị ngay khi đã cuộn đủ xa để người dùng có thể quay lại đầu nhanh.
      setIsVisible(scrollTop > 400);
    }
  }, [mainContainerRef]);

  useEffect(() => {
    const container = mainContainerRef?.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      // Initial check
      handleScroll();
    }

    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, [mainContainerRef, handleScroll]);

  const scrollToTop = () => {
    if (mainContainerRef && mainContainerRef.current) {
      mainContainerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    }
  };

  return (
    <button
      onClick={scrollToTop}
      aria-label="Trở về đầu trang"
      title="Trở về đầu trang"
      className={`fixed bottom-20 right-5 z-[999] rounded-full border border-gray-200/30 bg-gray-100/90 p-3 shadow-lg backdrop-blur-sm transition-all duration-300 ease-in-out hover:scale-110 hover:bg-gray-100/95 dark:border-gray-700/30 dark:bg-gray-800/90 dark:hover:bg-gray-700/95 md:bottom-6 md:right-6 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
    >
      <ChevronUp className="h-6 w-6" />
    </button>
  );
}
