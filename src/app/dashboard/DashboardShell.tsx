'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  Activity, Users, Calendar, TrendingUp, UserPlus, CreditCard,
  Settings, LogOut, MessageSquare, Menu, X, FileText, Target, Bell,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase-browser';

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

export default function DashboardShell({
  children,
  trialInfo,
}: {
  children: React.ReactNode;
  trialInfo: { status: string; daysRemaining: number | null; trialLimit: number | null; usedCount: number } | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('agent');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [unreadConversations, setUnreadConversations] = useState<any[]>([]);
  const notificationPollRef = useRef<NodeJS.Timeout | null>(null);
  const lastNotifiedRef = useRef<Record<string, string>>({});
  const lastSoundedRef = useRef<Record<string, string>>({});
  const hasInitializedNotificationsRef = useRef(false);
  const notificationWrapRef = useRef<HTMLDivElement | null>(null);

  const pageTitle = PAGE_TITLES[pathname] || 'Dashboard';

  // Load Supabase user info once on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return; }
      setUserName(user.user_metadata?.full_name ?? user.email ?? '');
    });
  }, [router]);

  // Also load role from public.users
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
      if (data?.role) setUserRole(data.role);
    });
  }, []);

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
    try {
      const res = await fetch('/api/conversations', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const conversations = data.conversations || [];

      let lastSeen: Record<string, string> = {};
      try { const raw = localStorage.getItem('conversationLastSeen'); lastSeen = raw ? JSON.parse(raw) : {}; } catch {}

      const unread = conversations
        .filter((conv: any) => {
          if (conv.last_sender !== 'contact' || !conv.last_message_time) return false;
          const seenAt = lastSeen[conv.id];
          return !seenAt || new Date(conv.last_message_time).getTime() > new Date(seenAt).getTime();
        })
        .sort((a: any, b: any) => new Date(b.last_message_time).getTime() - new Date(a.last_message_time).getTime());

      setNotificationCount(unread.length);
      setUnreadConversations(unread);

      const shouldNotify = typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden;

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
              body: conv.last_message || 'New inbound message', tag: conv.id,
            });
          }
        }
      });
      if (shouldPlaySound) playNotificationSound();
    } catch {}
  };

  useEffect(() => {
    fetchNotifications();
    if (notificationPollRef.current) clearInterval(notificationPollRef.current);
    notificationPollRef.current = setInterval(fetchNotifications, 5000);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'conversationLastSeen') fetchNotifications();
    };
    window.addEventListener('storage', handleStorage);
    return () => {
      if (notificationPollRef.current) { clearInterval(notificationPollRef.current); notificationPollRef.current = null; }
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!notificationOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!notificationWrapRef.current) return;
      if (!notificationWrapRef.current.contains(event.target as Node)) setNotificationOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notificationOpen]);

  useEffect(() => { setNotificationOpen(false); }, [pathname]);

  const handleBellClick = async () => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch {}
    }
    setNotificationOpen(current => !current);
  };

  const markConversationRead = (conv: any) => {
    if (!conv?.id || !conv?.last_message_time) return;
    try {
      const raw = localStorage.getItem('conversationLastSeen');
      const map = raw ? JSON.parse(raw) : {};
      map[conv.id] = conv.last_message_time;
      localStorage.setItem('conversationLastSeen', JSON.stringify(map));
    } catch {}
    setUnreadConversations(prev => prev.filter(item => item.id !== conv.id));
    setNotificationCount(prev => Math.max(0, prev - 1));
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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  return (
    <div className="dashboard-shell min-h-screen text-foreground">
      {/* Trial Banner */}
      {trialInfo?.status === 'trial' && trialInfo.daysRemaining !== null && (
        <div className={`w-full px-4 py-2 text-sm font-medium text-center ${
          trialInfo.daysRemaining <= 2 ? 'bg-red-500 text-white' : 'bg-amber-400 text-amber-900'
        }`}>
          {trialInfo.daysRemaining <= 0
            ? 'Your trial has expired. '
            : `Your trial ends in ${trialInfo.daysRemaining} day${trialInfo.daysRemaining === 1 ? '' : 's'}. `}
          Upgrade to continue uninterrupted service.{' '}
          <a href="/dashboard/billing" className="underline font-semibold">Upgrade now</a>
        </div>
      )}

      {/* Top Navigation */}
      <nav className="surface-strong border-b border-white/40 sticky top-0 z-30">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden p-2 rounded-full hover:bg-white/70 mr-2">
                <Menu className="w-5 h-5 text-muted" />
              </button>
              <h1 className="text-2xl font-display tracking-tight text-foreground">{pageTitle}</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="relative" ref={notificationWrapRef}>
                <button type="button" onClick={handleBellClick} className="relative p-2 rounded-full hover:bg-white/70" aria-label="Notifications">
                  <Bell className="w-5 h-5 text-muted" />
                  {notificationCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-semibold rounded-full h-5 min-w-[20px] px-1 flex items-center justify-center">
                      {notificationCount > 99 ? '99+' : notificationCount}
                    </span>
                  )}
                </button>
                {notificationOpen && (
                  <div className="absolute right-0 mt-2 w-80 surface-strong rounded-2xl border border-white/60 shadow-2xl z-50">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/50">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Notifications</p>
                        <p className="text-xs text-muted">Unread conversations</p>
                      </div>
                      <button type="button" onClick={markAllRead} disabled={unreadConversations.length === 0}
                        className="text-xs font-medium text-primary hover:text-primary/80 disabled:text-muted">
                        Mark all read
                      </button>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {unreadConversations.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-muted text-center">No unread messages.</div>
                      ) : (
                        unreadConversations.slice(0, 8).map((conv: any) => (
                          <button key={conv.id} type="button" onClick={() => markConversationRead(conv)}
                            className="w-full text-left px-4 py-3 border-b border-white/50 hover:bg-white/60">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{conv.contact_name || conv.contact_phone || 'Unknown'}</p>
                                <p className="text-xs text-muted truncate">{conv.last_message || 'New inbound message'}</p>
                              </div>
                              <span className="text-[11px] text-soft whitespace-nowrap">{formatTimeAgo(conv.last_message_time)}</span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                    {unreadConversations.length > 8 && (
                      <button type="button" onClick={() => { setNotificationOpen(false); router.push('/dashboard/conversations'); }}
                        className="w-full px-4 py-2 text-xs font-semibold text-primary hover:text-primary/80 hover:bg-white/70">
                        View all conversations
                      </button>
                    )}
                  </div>
                )}
              </div>
              <a href="/dashboard/settings" className="p-2 rounded-full hover:bg-white/70">
                <Settings className="w-5 h-5 text-muted" />
              </a>
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-semibold shadow-sm">
                {userName?.[0]?.toUpperCase() ?? '?'}
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex">
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        <aside className={`
          fixed md:sticky inset-y-0 md:top-16 left-0 z-50 md:z-10 w-64 surface-strong border-r border-white/40 md:h-[calc(100vh-4rem)] md:min-h-0
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
        `}>
          <div className="flex items-center justify-between px-4 pt-4 md:hidden">
            <span className="text-sm font-semibold text-foreground">Menu</span>
            <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-full hover:bg-white/70">
              <X className="w-5 h-5 text-muted" />
            </button>
          </div>

          <nav className="mt-5 px-2 flex flex-col h-[calc(100%-3rem)] overflow-y-auto">
            <div className="flex-1">
              {NAV_ITEMS.filter(item => !item.adminOnly || userRole === 'admin').map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <a key={item.href} href={item.href} onClick={() => setSidebarOpen(false)}
                    className={`group flex items-center px-3 py-2 text-sm font-medium rounded-xl mt-1 transition-all ${
                      active ? 'bg-white/70 text-foreground shadow-sm' : 'text-muted hover:bg-white/60 hover:text-foreground'
                    }`}>
                    <Icon className="mr-3 h-5 w-5" />
                    {item.label}
                  </a>
                );
              })}
            </div>

            <div className="border-t border-white/40 pt-4 pb-4">
              <button onClick={handleSignOut}
                className="text-muted hover:bg-red-50/80 hover:text-red-600 group flex items-center px-3 py-2 text-sm font-medium rounded-xl w-full transition-all">
                <LogOut className="mr-3 h-5 w-5" />
                Sign Out
              </button>
            </div>
          </nav>
        </aside>

        <main className="flex-1 p-6 min-w-0 overflow-x-hidden text-foreground">
          {children}
        </main>
      </div>
    </div>
  );
}
