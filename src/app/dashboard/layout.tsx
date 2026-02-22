'use client';

import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  Users,
  Calendar,
  TrendingUp,
  UserPlus,
  CreditCard,
  Settings,
  LogOut,
  MessageSquare,
  Menu,
  X,
  FileText,
  Target,
  Bell,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const NAV_ITEMS: Array<{ href: string; label: string; icon: any; adminOnly?: boolean }> = [
  { href: '/dashboard', label: 'Dashboard', icon: Activity },
  { href: '/dashboard/conversations', label: 'Conversations', icon: MessageSquare },
  { href: '/dashboard/leads', label: 'Leads', icon: Users },
  { href: '/dashboard/calendar', label: 'Calendar', icon: Calendar },
  { href: '/dashboard/analytics', label: 'Analytics', icon: TrendingUp },
  { href: '/dashboard/handoffs', label: 'Handoffs', icon: UserPlus },

  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
  { href: '/dashboard/outreach', label: 'Outreach', icon: Target, adminOnly: true },
];

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/conversations': 'Conversations',
  '/dashboard/leads': 'Leads Management',
  '/dashboard/calendar': 'Calendar',
  '/dashboard/analytics': 'Analytics',
  '/dashboard/handoffs': 'Handoff Management',

  '/dashboard/billing': 'Billing',
  '/dashboard/settings': 'Settings',
  '/dashboard/outreach': 'Outreach Queue',
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [unreadConversations, setUnreadConversations] = useState<any[]>([]);
  const notificationPollRef = useRef<NodeJS.Timeout | null>(null);
  const lastNotifiedRef = useRef<Record<string, string>>({});
  const lastSoundedRef = useRef<Record<string, string>>({});
  const hasInitializedNotificationsRef = useRef(false);
  const notificationWrapRef = useRef<HTMLDivElement | null>(null);

  const isLoading = status === 'loading';
  const isUnauthenticated = status === 'unauthenticated';

  const pageTitle = PAGE_TITLES[pathname] || 'Dashboard';

  const formatTimeAgo = (ts?: string) => {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(diff / 3600000);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(diff / 86400000);
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString();
  };

  const playNotificationSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.4);
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.45);
      oscillator.onended = () => audioContext.close();
    } catch {}
  };

  const fetchNotifications = async () => {
    if (!session?.user?.tenantId) return;
    try {
      const res = await fetch('/api/conversations', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const conversations = data.conversations || [];

      let lastSeen: Record<string, string> = {};
      try {
        const raw = localStorage.getItem('conversationLastSeen');
        lastSeen = raw ? JSON.parse(raw) : {};
      } catch {}

      const unread = conversations
        .filter((conv: any) => {
          if (conv.last_sender !== 'contact' || !conv.last_message_time) return false;
          const seenAt = lastSeen[conv.id];
          return !seenAt || new Date(conv.last_message_time).getTime() > new Date(seenAt).getTime();
        })
        .sort(
          (a: any, b: any) =>
            new Date(b.last_message_time).getTime() - new Date(a.last_message_time).getTime()
        );

      setNotificationCount(unread.length);
      setUnreadConversations(unread);

      const shouldNotify =
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted' &&
        document.hidden;

      if (!hasInitializedNotificationsRef.current) {
        unread.forEach((conv: any) => {
          lastNotifiedRef.current[conv.id] = conv.last_message_time;
          lastSoundedRef.current[conv.id] = conv.last_message_time;
        });
        hasInitializedNotificationsRef.current = true;
        return;
      }

      let shouldPlaySound = false;

      unread.forEach((conv: any) => {
        const lastSounded = lastSoundedRef.current[conv.id];
        if (!lastSounded || new Date(conv.last_message_time).getTime() > new Date(lastSounded).getTime()) {
          lastSoundedRef.current[conv.id] = conv.last_message_time;
          shouldPlaySound = true;
        }

        if (shouldNotify) {
          const lastNotified = lastNotifiedRef.current[conv.id];
          if (!lastNotified || new Date(lastNotified).getTime() < new Date(conv.last_message_time).getTime()) {
            lastNotifiedRef.current[conv.id] = conv.last_message_time;
            new Notification(conv.contact_name || conv.contact_phone || 'New message', {
              body: conv.last_message || 'New inbound message',
              tag: conv.id,
            });
          }
        }
      });

      if (shouldPlaySound) {
        playNotificationSound();
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.tenantId) return;

    fetchNotifications();
    if (notificationPollRef.current) clearInterval(notificationPollRef.current);
    notificationPollRef.current = setInterval(fetchNotifications, 5000);

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'conversationLastSeen') {
        fetchNotifications();
      }
    };

    window.addEventListener('storage', handleStorage);

    return () => {
      if (notificationPollRef.current) {
        clearInterval(notificationPollRef.current);
        notificationPollRef.current = null;
      }
      window.removeEventListener('storage', handleStorage);
    };
  }, [status, session?.user?.tenantId]);

  useEffect(() => {
    if (isUnauthenticated) {
      router.push('/auth/login');
    }
  }, [isUnauthenticated, router]);

  useEffect(() => {
    if (!notificationOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!notificationWrapRef.current) return;
      if (!notificationWrapRef.current.contains(event.target as Node)) {
        setNotificationOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notificationOpen]);

  useEffect(() => {
    setNotificationOpen(false);
  }, [pathname]);

  const handleBellClick = async () => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {}
    }
    setNotificationOpen((current) => !current);
  };

  const markConversationRead = (conv: any) => {
    if (!conv?.id || !conv?.last_message_time) return;
    try {
      const raw = localStorage.getItem('conversationLastSeen');
      const map = raw ? JSON.parse(raw) : {};
      map[conv.id] = conv.last_message_time;
      localStorage.setItem('conversationLastSeen', JSON.stringify(map));
    } catch {}
    setUnreadConversations((prev) => prev.filter((item) => item.id !== conv.id));
    setNotificationCount((prev) => Math.max(0, prev - 1));
    setNotificationOpen(false);
    router.push(`/dashboard/conversations/${conv.id}`);
  };

  const markAllRead = () => {
    if (unreadConversations.length === 0) return;
    try {
      const raw = localStorage.getItem('conversationLastSeen');
      const map = raw ? JSON.parse(raw) : {};
      unreadConversations.forEach((conv: any) => {
        if (conv.last_message_time) {
          map[conv.id] = conv.last_message_time;
          lastNotifiedRef.current[conv.id] = conv.last_message_time;
          lastSoundedRef.current[conv.id] = conv.last_message_time;
        }
      });
      localStorage.setItem('conversationLastSeen', JSON.stringify(map));
    } catch {}
    setNotificationCount(0);
    setUnreadConversations([]);
    setNotificationOpen(false);
  };

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (isUnauthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation */}
      <nav className="bg-white shadow-sm border-b sticky top-0 z-30">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              {/* Mobile menu button */}
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="md:hidden p-2 rounded-md hover:bg-gray-100 mr-2"
              >
                <Menu className="w-5 h-5 text-gray-600" />
              </button>
              <h1 className="text-xl font-semibold text-gray-900">{pageTitle}</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="relative" ref={notificationWrapRef}>
                <button
                  type="button"
                  onClick={handleBellClick}
                  className="relative p-2 rounded-md hover:bg-gray-100"
                  aria-label="Notifications"
                >
                  <Bell className="w-5 h-5 text-gray-600" />
                  {notificationCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-semibold rounded-full h-5 min-w-[20px] px-1 flex items-center justify-center">
                      {notificationCount > 99 ? '99+' : notificationCount}
                    </span>
                  )}
                </button>
                {notificationOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-xl z-50">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Notifications</p>
                        <p className="text-xs text-gray-500">Unread conversations</p>
                      </div>
                      <button
                        type="button"
                        onClick={markAllRead}
                        disabled={unreadConversations.length === 0}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:text-gray-400"
                      >
                        Mark all read
                      </button>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {unreadConversations.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-gray-500 text-center">
                          No unread messages.
                        </div>
                      ) : (
                        unreadConversations.slice(0, 8).map((conv: any) => (
                          <button
                            key={conv.id}
                            type="button"
                            onClick={() => markConversationRead(conv)}
                            className="w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {conv.contact_name || conv.contact_phone || 'Unknown'}
                                </p>
                                <p className="text-xs text-gray-500 truncate">
                                  {conv.last_message || 'New inbound message'}
                                </p>
                              </div>
                              <span className="text-[11px] text-gray-400 whitespace-nowrap">
                                {formatTimeAgo(conv.last_message_time)}
                              </span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                    {unreadConversations.length > 8 && (
                      <button
                        type="button"
                        onClick={() => {
                          setNotificationOpen(false);
                          router.push('/dashboard/conversations');
                        }}
                        className="w-full px-4 py-2 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      >
                        View all conversations
                      </button>
                    )}
                  </div>
                )}
              </div>
              <a href="/dashboard/settings" className="p-2 rounded-md hover:bg-gray-100">
                <Settings className="w-5 h-5 text-gray-600" />
              </a>
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
                {session?.user?.name?.[0]?.toUpperCase() || '?'}
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`
            fixed md:sticky inset-y-0 md:top-16 left-0 z-50 md:z-10 w-64 bg-white shadow-sm md:h-[calc(100vh-4rem)] md:min-h-0
            transform transition-transform duration-200 ease-in-out
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            md:translate-x-0
          `}
        >
          {/* Mobile close button */}
          <div className="flex items-center justify-between px-4 pt-4 md:hidden">
            <span className="text-sm font-semibold text-gray-900">Menu</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 rounded-md hover:bg-gray-100"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          <nav className="mt-5 px-2 flex flex-col h-[calc(100%-3rem)] overflow-y-auto">
            <div className="flex-1">
              {NAV_ITEMS.filter(item => !item.adminOnly || session?.user?.role === 'admin').map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md mt-1 ${
                      active
                        ? 'bg-gray-100 text-gray-900'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="mr-3 h-5 w-5" />
                    {item.label}
                  </a>
                );
              })}
            </div>

            <div className="border-t border-gray-200 pt-4 pb-4">
              <button
                onClick={() => signOut({ callbackUrl: '/auth/login' })}
                className="text-gray-600 hover:bg-red-50 hover:text-red-700 group flex items-center px-2 py-2 text-sm font-medium rounded-md w-full"
              >
                <LogOut className="mr-3 h-5 w-5" />
                Sign Out
              </button>
            </div>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 min-w-0 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
