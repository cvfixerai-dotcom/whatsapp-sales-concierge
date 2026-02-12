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
} from 'lucide-react';
import { useState } from 'react';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: Activity },
  { href: '/dashboard/conversations', label: 'Conversations', icon: MessageSquare },
  { href: '/dashboard/leads', label: 'Leads', icon: Users },
  { href: '/dashboard/calendar', label: 'Calendar', icon: Calendar },
  { href: '/dashboard/analytics', label: 'Analytics', icon: TrendingUp },
  { href: '/dashboard/handoffs', label: 'Handoffs', icon: UserPlus },
  { href: '/dashboard/activity', label: 'Activity Log', icon: FileText },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/conversations': 'Conversations',
  '/dashboard/leads': 'Leads Management',
  '/dashboard/calendar': 'Calendar',
  '/dashboard/analytics': 'Analytics',
  '/dashboard/handoffs': 'Handoff Management',
  '/dashboard/activity': 'Activity Log',
  '/dashboard/billing': 'Billing',
  '/dashboard/settings': 'Settings',
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

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    router.push('/auth/login');
    return null;
  }

  const pageTitle = PAGE_TITLES[pathname] || 'Dashboard';

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation */}
      <nav className="bg-white shadow-sm border-b">
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
            fixed md:static inset-y-0 left-0 z-50 w-64 bg-white shadow-sm min-h-screen
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

          <nav className="mt-5 px-2 flex flex-col h-[calc(100vh-5rem)]">
            <div className="flex-1">
              {NAV_ITEMS.map((item) => {
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
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
