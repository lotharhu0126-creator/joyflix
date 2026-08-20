"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useIsTablet } from "@/lib/useIsTablet";
import { useFloatingHeaderVisibility } from "@/lib/useFloatingHeaderVisibility";
import { BackButton } from "./BackButton";
import MobileBottomNav from "./MobileBottomNav";
import MobileHeader from "./MobileHeader";

import { useSite } from "./SiteProvider";
import { TabletSidebar } from "./TabletSidebar";
import { BackToTopButton } from "./BackToTopButton";
import { FloatingHeader } from "./FloatingHeader";
import { TabletHeaderActions } from "./TabletHeaderActions";

interface PageLayoutProps {
  children: React.ReactNode;
  activePath?: string;
  title?: string;
  headerContent?: React.ReactNode;
}

const PageLayout = ({
  children,
  activePath = "/",
  title,
  headerContent,
}: PageLayoutProps) => {
  const { mainContainerRef } = useSite();
  const [heightClass, setHeightClass] = useState("h-screen");
  const [isTabletSidebarOpen, setIsTabletSidebarOpen] = useState(false);
  const isTablet = useIsTablet();
  const pathname = usePathname();

  const showAdminBackButton = pathname === "/admin";
  const showAdminSubPageBackButton =
    pathname.startsWith("/admin/") && pathname !== "/admin";
  const showTabletSidebar =
    pathname === "/" || pathname === "/douban" || pathname === "/search";

  const showFloatingHeader =
    pathname === "/" || pathname === "/douban" || pathname === "/search";
  const floatingHeaderHeight = 56; // h-14 in tailwind css
  const isFloatingHeaderVisible = useFloatingHeaderVisibility(
    mainContainerRef || null
  );

  useEffect(() => {
    const ua = navigator.userAgent;
    const isMobile = /Mobi/i.test(ua) || window.innerWidth < 768;
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);

    if (isMobile && isSafari) {
      setHeightClass("min-h-screen");
    }
  }, []);

  return (
    <div className={`w-full ${heightClass}`}>
      {/* 浮动头部 */}
      {showFloatingHeader && (
        <FloatingHeader
          title={title}
          setIsOpen={setIsTabletSidebarOpen}
          scrollContainerRef={mainContainerRef || null}
          isOpen={isTabletSidebarOpen}
        />
      )}

      {/* 移动端头部 */}
      <MobileHeader
        showBackButton={
          (isTablet ?? false) && (activePath || "").startsWith("/detail")
        }
      />

      {/* 主要布局容器 */}
      <div
        className={`flex w-full h-full md:min-h-auto md:grid md:grid-cols-[auto_1fr]`}
      >
        {/* 侧边栏 - 桌面端始终显示，平板端由按钮控制 */}
        <div className="hidden md:block">
          <TabletSidebar
            isOpen={isTabletSidebarOpen}
            setIsOpen={setIsTabletSidebarOpen}
            activePath={activePath}
            isFloatingHeaderVisible={isFloatingHeaderVisible}
            floatingHeaderHeight={floatingHeaderHeight}
          />
        </div>

        {/* 主内容区域 */}
        {/* 主内容区域 */}
        <div
          ref={mainContainerRef} // 将 ref 附加到这个容器
          className="relative min-w-0 flex-1 transition-all duration-300 md:overflow-y-auto" // 添加 overflow-y-auto
        >
          {/* 平板端管理员页返回按钮 */}
          {showAdminBackButton && (
            <div className="absolute top-3 left-1 z-20 hidden md:flex">
              <BackButton />
            </div>
          )}
          {/* 平板端管理员页返回按钮 */}

          {/* 桌面端左上角返回按钮 - 管理子页面*/}
          {showAdminSubPageBackButton && (
            <div className="absolute top-3 left-1 z-20 hidden md:flex">
              <BackButton />
            </div>
          )}

          {/* 桌面端左上角返回按钮 */}

          {/* 平板端/桌面端 顶部按钮组 */}
          {showTabletSidebar && (
            <div className="absolute top-2 left-4 right-4 z-20 hidden md:flex items-center justify-between">
              <TabletHeaderActions
                setIsOpen={setIsTabletSidebarOpen}
                isOpen={isTabletSidebarOpen}
                title={title}
              />
            </div>
          )}

          {/* 桌面端左上角返回按钮 - 播放页 */}
          {["/play"].includes(activePath) && (
            <div className="absolute top-3 left-1 z-20 hidden md:flex">
              <BackButton />
            </div>
          )}

          {/* 桌面端左上角返回按钮 - 详细页和播放页 */}
          {((activePath || "").startsWith("/detail") ||
            activePath === "/play") && (
            <div className="absolute top-3 left-1 right-4 z-20 hidden md:flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BackButton />
                {headerContent}
              </div>
              <div className="flex items-center gap-2">
                <TabletHeaderActions
                  setIsOpen={setIsTabletSidebarOpen}
                  isOpen={isTabletSidebarOpen}
                />
              </div>
            </div>
          )}

          {/* 桌面端顶部按钮 (已合并到 TabletHeaderActions) */}

          {/* 主内容 */}
          <main
            className="flex-1 md:min-h-0 mb-14 md:mb-0"
            style={{
              paddingBottom: "calc(3.5rem + env(safe-area-inset-bottom))",
              paddingTop: "env(safe-area-inset-top)",
            }}
          >
            {children}
          </main>
        </div>
      </div>

      {/* 移动端底部导航 */}
      <div className="md:hidden">
        <MobileBottomNav activePath={activePath} />
      </div>

      {/* 返回顶部按钮 - 仅在特定平板页面显示 */}
      {showTabletSidebar && <BackToTopButton />}
    </div>
  );
};

export default PageLayout;
