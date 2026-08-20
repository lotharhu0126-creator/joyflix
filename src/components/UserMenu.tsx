/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

'use client';

import {
  KeyRound,
  LogIn,
  LogOut,
  Settings,
  Cog,
  User,
  UserPlus,
  X,
  Moon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useEffect, useState, Fragment, FC, ReactNode, useRef } from 'react';
import CustomSelect from './CustomSelect';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useTheme } from 'next-themes'; // Added

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';

// Reusable Components (Apple-like design)
// =================================================================

interface AuthInfo {
  username?: string;
  role?: 'owner' | 'admin' | 'user';
}

interface MenuItemProps {
  icon: FC<any>;
  text: string;
  onClick: () => void;
  className?: string;
}

const MenuItem: FC<MenuItemProps> = ({
  icon: Icon,
  text,
  onClick,
  className = '',
}) => (
  <button
    onClick={onClick}
    className={`w-full px-3 py-2 text-left flex items-center gap-3 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200/80 dark:hover:bg-zinc-700/80 transition-colors text-sm rounded-md ${className}`}
  >
    <Icon className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
    <span className="font-medium">{text}</span>
  </button>
);

interface ModalProps {
  children: ReactNode;
  onClose: () => void;
  title: string;
  showReset?: boolean;
  onReset?: () => void;
}

const Modal: FC<ModalProps> = ({
  children,
  onClose,
  title,
  showReset,
  onReset,
}) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.3 }}
    className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm z-[1000] flex items-center justify-center p-4"
    onClick={onClose}
  >
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className="w-full max-w-xl max-h-[90vh] bg-white/90 dark:bg-zinc-800/90 backdrop-blur-xl rounded-2xl shadow-2xl z-[1001] overflow-hidden flex flex-col"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-200">
            {title}
          </h3>
          {showReset && (
            <button
              onClick={onReset}
              className="px-2 py-1 text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 border border-red-200 hover:border-red-300 dark:border-red-800 dark:hover:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
              title="重置为默认设置"
            >
              重置
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 p-1 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-6 overflow-y-auto">{children}</div>
    </motion.div>
  </motion.div>
);

// Main UserMenu Component
// =================================================================

export const UserMenu: React.FC<{ className?: string }> = ({ className }) => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    right: number;
  } | null>(null);

  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);
  const [storageType, setStorageType] = useState<string>('sqlite');
  const [mounted, setMounted] = useState(false);

  // Theme states
  const { setTheme, resolvedTheme } = useTheme(); // Added
  const [mountedTheme, setMountedTheme] = useState(false); // Added

  const setThemeColor = (theme?: string) => {
    const color = theme === 'dark' ? '#000000' : '#C5D8E2';
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', color);
  };

  // Settings states
  const [doubanProxyUrl, setDoubanProxyUrl] = useState('');
  const [enableOptimization, setEnableOptimization] = useState(true);
  const [doubanDataSource, setDoubanDataSource] = useState('direct');
  const [doubanImageProxyType, setDoubanImageProxyType] = useState('direct');
  const [doubanImageProxyUrl, setDoubanImageProxyUrl] = useState('');

  const doubanDataSourceOptions = [
    { value: 'direct', label: '直连（服务器直接请求豆瓣）' },
    { value: 'cors-proxy-zwei', label: '豆瓣 CDN' },
    { value: 'cmliussss-cdn-tencent', label: '豆瓣 CDN（腾讯云）' },
    { value: 'cmliussss-cdn-ali', label: '豆瓣 CDN（阿里云）' },
    { value: 'custom', label: '自定义代理' },
  ];

  const doubanImageProxyTypeOptions = [
    { value: 'direct', label: '直连（浏览器直接请求豆瓣）' },
    { value: 'server', label: '服务器代理（由服务器代理请求豆瓣）' },
    { value: 'img3', label: '豆瓣精品 CDN（官方）' },
    { value: 'cmliussss-cdn-tencent', label: '豆瓣 CDN（腾讯云）' },
    { value: 'cmliussss-cdn-ali', label: '豆瓣 CDN（阿里云）' },
    { value: 'custom', label: '自定义代理' },
  ];

  // Change password states
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  // Added
  useEffect(() => {
    setMountedTheme(true);
  }, []);

  // Added
  const toggleTheme = () => {
    const targetTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
    setThemeColor(targetTheme);

    if (!(document as any).startViewTransition) {
      setTheme(targetTheme);
      return;
    }

    (document as any).startViewTransition(() => {
      setTheme(targetTheme);
    });
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const auth = getAuthInfoFromBrowserCookie();
      setAuthInfo(auth);
      const type = (window as any).RUNTIME_CONFIG?.STORAGE_TYPE || 'sqlite';
      setStorageType(type);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedDoubanDataSource = localStorage.getItem('doubanDataSource');
      const defaultDoubanProxyType =
        (window as any).RUNTIME_CONFIG?.DOUBAN_PROXY_TYPE || 'direct';
      setDoubanDataSource(savedDoubanDataSource || defaultDoubanProxyType);

      const savedDoubanProxyUrl = localStorage.getItem('doubanProxyUrl');
      const defaultDoubanProxy =
        (window as any).RUNTIME_CONFIG?.DOUBAN_PROXY || '';
      setDoubanProxyUrl(savedDoubanProxyUrl || defaultDoubanProxy);

      const savedDoubanImageProxyType = localStorage.getItem(
        'doubanImageProxyType'
      );
      const defaultDoubanImageProxyType =
        (window as any).RUNTIME_CONFIG?.DOUBAN_IMAGE_PROXY_TYPE || 'direct';
      setDoubanImageProxyType(
        savedDoubanImageProxyType || defaultDoubanImageProxyType
      );

      const savedDoubanImageProxyUrl = localStorage.getItem(
        'doubanImageProxyUrl'
      );
      const defaultDoubanImageProxyUrl =
        (window as any).RUNTIME_CONFIG?.DOUBAN_IMAGE_PROXY || '';
      setDoubanImageProxyUrl(
        savedDoubanImageProxyUrl || defaultDoubanImageProxyUrl
      );

      const savedEnableOptimization =
        localStorage.getItem('enableOptimization');
      if (savedEnableOptimization !== null)
        setEnableOptimization(JSON.parse(savedEnableOptimization));
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handlePos = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        // Use a fixed right value (16px for right-4) and adjust top for framer-motion y: -10 and extra clearance
        setMenuPosition({
          top: rect.bottom + 20, // Increased clearance
          right: 16, // Fixed value for right-4
        });
      }
    };

    handlePos(); // Set position on open

    window.addEventListener('resize', handlePos);
    window.addEventListener('scroll', handlePos, true);

    return () => {
      window.removeEventListener('resize', handlePos);
      window.removeEventListener('scroll', handlePos, true);
    };
  }, [isOpen]);

  const handleMenuClick = () => setIsOpen(!isOpen);
  const handleCloseMenu = () => setIsOpen(false);

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('注销请求失败:', error);
    }
    window.location.href = '/';
  };

  const handleAdminPanel = () => router.push('/admin');
  const handleLogin = () => {
    setIsOpen(false);
    router.push('/login');
  };
  const handleRegister = () => {
    setIsOpen(false);
    router.push('/register');
  };
  const handleChangePassword = () => {
    setIsOpen(false);
    setIsChangePasswordOpen(true);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
  };
  const handleCloseChangePassword = () => {
    setIsChangePasswordOpen(false);
  };

  const handleSubmitChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的密码不一致');
      return;
    }
    if (!newPassword) {
      setPasswordError('新密码不得为空');
      return;
    }
    setPasswordError('');
    setPasswordLoading(true);
    try {
      const response = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        setPasswordError(data.error || '修改密码失败');
        return;
      }
      setIsChangePasswordOpen(false);
      await handleLogout();
    } catch (error) {
      setPasswordError('网络错误，请稍后重试');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSettings = () => {
    setIsOpen(false);
    setIsSettingsOpen(true);
  };
  const handleCloseSettings = () => setIsSettingsOpen(false);

  const handleResetSettings = () => {
    const defaultDoubanProxyType =
      (window as any).RUNTIME_CONFIG?.DOUBAN_PROXY_TYPE || 'direct';
    const defaultDoubanProxy =
      (window as any).RUNTIME_CONFIG?.DOUBAN_PROXY || '';
    const defaultDoubanImageProxyType =
      (window as any).RUNTIME_CONFIG?.DOUBAN_IMAGE_PROXY_TYPE || 'direct';
    const defaultDoubanImageProxyUrl =
      (window as any).RUNTIME_CONFIG?.DOUBAN_IMAGE_PROXY || '';

    setEnableOptimization(true);
    setDoubanProxyUrl(defaultDoubanProxy);
    setDoubanDataSource(defaultDoubanProxyType);
    setDoubanImageProxyType(defaultDoubanImageProxyType);
    setDoubanImageProxyUrl(defaultDoubanImageProxyUrl);

    localStorage.setItem('enableOptimization', JSON.stringify(true));
    localStorage.setItem('doubanProxyUrl', defaultDoubanProxy);
    localStorage.setItem('doubanDataSource', defaultDoubanProxyType);
    localStorage.setItem('doubanImageProxyType', defaultDoubanImageProxyType);
    localStorage.setItem('doubanImageProxyUrl', defaultDoubanImageProxyUrl);
  };

  const isSignedIn = Boolean(authInfo?.username);
  const showAdminPanel =
    authInfo?.role === 'owner' || authInfo?.role === 'admin';
  const showChangePassword =
    isSignedIn && authInfo?.role !== 'owner' && storageType !== 'localstorage';

  const getRoleText = (role?: string) =>
    ({ owner: 'Chủ hệ thống', admin: 'Quản trị viên', user: 'Thành viên' }[
      role || ''
    ] || 'Khách');

  const menuPanel = (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-black/10 dark:bg-black/30 z-[999]"
        onClick={handleCloseMenu}
      />
      <motion.div
        initial={{ opacity: 0, y: -10, x: 10 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        exit={{ opacity: 0, y: -10, x: 10 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        style={
          menuPosition
            ? { top: `${menuPosition.top}px`, right: `${menuPosition.right}px` }
            : {}
        }
        className="fixed w-64 bg-white/80 dark:bg-zinc-800/80 backdrop-blur-xl rounded-2xl shadow-2xl z-[1001] ring-1 ring-zinc-900/5 dark:ring-white/10 overflow-hidden select-none p-2"
      >
        <div className="px-3 py-4 flex items-center gap-4">
          {' '}
          {/* Changed gap-3 to gap-4 */}
          {/* Avatar */}
          <div className="relative w-12 h-12 rounded-full overflow-hidden flex-shrink-0 ring-1 ring-blue-400/30">
            <Image
              src="/userhead.jpg"
              alt="User Avatar"
              fill
              className="object-contain object-center"
            />
          </div>
          {/* User Info */}
          <div className="flex-grow">
            <div className="font-semibold text-zinc-900 dark:text-zinc-100 text-base truncate">
              {authInfo?.username || 'Khách'}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              {/* Blue dot */}
              <div className="w-2 h-2 rounded-full bg-blue-300 flex-shrink-0"></div>
              {/* Role */}
              <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                {getRoleText(authInfo?.role || 'user')}
              </span>
            </div>
          </div>
        </div>
        {/* New Theme Toggle (moved position) */}
        {mountedTheme && (
          <div className="flex items-center justify-between px-3 py-2 text-sm rounded-md hover:bg-zinc-200/80 dark:hover:bg-zinc-700/80 transition-colors">
            <div className="flex items-center gap-3">
              <Moon className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                黑夜模式
              </span>
            </div>
            <label className="flex items-center cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={resolvedTheme === 'dark'}
                  onChange={toggleTheme}
                />
                <div className="w-9 h-5 bg-zinc-300 dark:bg-zinc-700 rounded-full peer-checked:bg-blue-400 transition-colors"></div>
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-[18px]"></div>
              </div>
            </label>
          </div>
        )}
        <div className="py-1 space-y-1">
          <MenuItem icon={Cog} text="应用设置" onClick={handleSettings} />
          {isSignedIn ? (
            <>
              {showAdminPanel && (
                <MenuItem
                  icon={Settings}
                  text="Quản trị"
                  onClick={handleAdminPanel}
                />
              )}
              {showChangePassword && (
                <MenuItem
                  icon={KeyRound}
                  text="Đổi mật khẩu"
                  onClick={handleChangePassword}
                />
              )}
              <MenuItem
                icon={LogOut}
                text="Đăng xuất"
                onClick={handleLogout}
                className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              />
            </>
          ) : (
            <>
              <MenuItem icon={LogIn} text="Đăng nhập" onClick={handleLogin} />
              <MenuItem
                icon={UserPlus}
                text="Đăng ký"
                onClick={handleRegister}
              />
            </>
          )}
        </div>
      </motion.div>
    </>
  );

  return (
    <Fragment>
      <div className="relative">
        <button
          ref={buttonRef}
          onClick={handleMenuClick}
          className={`w-10 h-10 p-2 rounded-full flex items-center justify-center text-zinc-600 hover:bg-zinc-200/50 dark:text-zinc-300 dark:hover:bg-zinc-700/50 transition-colors ${className}`}
          aria-label="User Menu"
        >
          <User className="w-full h-full" />
        </button>
      </div>

      {mounted &&
        createPortal(
          <AnimatePresence>{isOpen && menuPanel}</AnimatePresence>,
          document.body
        )}

      {mounted &&
        createPortal(
          isSettingsOpen && (
            <AnimatePresence>
              <Modal
                onClose={handleCloseSettings}
                title="应用设置"
                showReset
                onReset={handleResetSettings}
              >
                <div className="space-y-6 text-sm">
                  {/* Douban Data Source */}
                  <div className="space-y-3 relative z-10">
                    <div>
                      <h4 className="font-medium text-zinc-800 dark:text-zinc-200">
                        豆瓣数据代理
                      </h4>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                        若遇无法获取豆瓣数据需重新选择代理方式
                      </p>
                    </div>
                    {/* Custom Dropdown would go here, for now, using a standard select for simplicity */}
                    <CustomSelect
                      options={doubanDataSourceOptions}
                      value={doubanDataSource}
                      onChange={(value) => {
                        setDoubanDataSource(value);
                        localStorage.setItem('doubanDataSource', value);
                      }}
                      className="w-full"
                    />
                  </div>

                  {/* Douban Custom Proxy URL */}
                  {doubanDataSource === 'custom' && (
                    <div className="space-y-3">
                      <div>
                        <h4 className="font-medium text-zinc-800 dark:text-zinc-200">
                          豆瓣代理地址
                        </h4>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                          自定义代理服务器地址
                        </p>
                      </div>
                      <input
                        type="text"
                        className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/50 dark:bg-zinc-800/50"
                        placeholder="例如: https://proxy.example.com/fetch?url="
                        value={doubanProxyUrl}
                        onChange={(e) => {
                          setDoubanProxyUrl(e.target.value);
                          localStorage.setItem(
                            'doubanProxyUrl',
                            e.target.value
                          );
                        }}
                      />
                    </div>
                  )}

                  <div className="border-t border-zinc-200 dark:border-zinc-700"></div>

                  {/* Douban Image Proxy */}
                  <div className="space-y-3 relative z-10">
                    <div>
                      <h4 className="font-medium text-zinc-800 dark:text-zinc-200">
                        豆瓣海报代理
                      </h4>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                        若遇无法获取豆瓣海报需重新选择代理方式
                      </p>
                    </div>
                    <CustomSelect
                      options={doubanImageProxyTypeOptions}
                      value={doubanImageProxyType}
                      onChange={(value) => {
                        setDoubanImageProxyType(value);
                        localStorage.setItem('doubanImageProxyType', value);
                      }}
                      className="w-full"
                    />
                  </div>

                  {/* Douban Custom Image Proxy URL */}
                  {doubanImageProxyType === 'custom' && (
                    <div className="space-y-3">
                      <div>
                        <h4 className="font-medium text-zinc-800 dark:text-zinc-200">
                          豆瓣图片代理地址
                        </h4>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                          自定义图片代理服务器地址
                        </p>
                      </div>
                      <input
                        type="text"
                        className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/50 dark:bg-zinc-800/50"
                        placeholder="例如: https://proxy.example.com/fetch?url="
                        value={doubanImageProxyUrl}
                        onChange={(e) => {
                          setDoubanImageProxyUrl(e.target.value);
                          localStorage.setItem(
                            'doubanImageProxyUrl',
                            e.target.value
                          );
                        }}
                      />
                    </div>
                  )}

                  <div className="border-t border-zinc-200 dark:border-zinc-700"></div>

                  {/* Optimization Toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-zinc-800 dark:text-zinc-200">
                        启用优选路线
                      </h4>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                        关闭此项可转为手动自选路线
                      </p>
                    </div>
                    <label className="flex items-center cursor-pointer">
                      <div className="relative">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={enableOptimization}
                          onChange={(e) => {
                            setEnableOptimization(e.target.checked);
                            localStorage.setItem(
                              'enableOptimization',
                              JSON.stringify(e.target.checked)
                            );
                          }}
                        />
                        <div className="w-11 h-6 bg-zinc-300 dark:bg-zinc-700 rounded-full peer-checked:bg-blue-400 transition-colors"></div>
                        <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5"></div>
                      </div>
                    </label>
                  </div>
                </div>
              </Modal>
            </AnimatePresence>
          ),
          document.body
        )}

      {mounted &&
        createPortal(
          isChangePasswordOpen && (
            <AnimatePresence>
              <Modal onClose={handleCloseChangePassword} title="修改密码">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      新密码
                    </label>
                    <input
                      type="password"
                      className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={passwordLoading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      确认密码
                    </label>
                    <input
                      type="password"
                      className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={passwordLoading}
                    />
                  </div>
                  {passwordError && (
                    <div className="text-red-500 text-sm bg-red-100 dark:bg-red-900/20 p-3 rounded-md border border-red-200 dark:border-red-800">
                      {passwordError}
                    </div>
                  )}
                </div>
                <div className="flex gap-3 mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-700">
                  <button
                    onClick={handleCloseChangePassword}
                    className="flex-1 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded-md transition-colors"
                    disabled={passwordLoading}
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSubmitChangePassword}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-md transition-colors disabled:opacity-50"
                    disabled={
                      passwordLoading || !newPassword || !confirmPassword
                    }
                  >
                    {passwordLoading ? '修改中...' : '修改'}
                  </button>
                </div>
              </Modal>
            </AnimatePresence>
          ),
          document.body
        )}
    </Fragment>
  );
};

export default UserMenu;
