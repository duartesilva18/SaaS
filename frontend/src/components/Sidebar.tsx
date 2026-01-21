'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  LayoutDashboard, 
  PieChart, 
  Clock, 
  Receipt, 
  Tag, 
  HelpCircle, 
  CreditCard, 
  Settings, 
  Shield, 
  Landmark, 
  Sparkles, 
  LogOut, 
  ChevronLeft, 
  ChevronRight,
  Menu,
  X
} from 'lucide-react';
import { useTranslation } from '@/lib/LanguageContext';
import { useUser } from '@/lib/UserContext';

const menuSections = (t: any) => [
  {
    title: "Principal",
    items: [
      {
        name: t.dashboard.sidebar.dashboard,
        href: '/dashboard',
        icon: LayoutDashboard,
      },
      {
        name: t.dashboard.sidebar.analytics,
        href: '/analytics',
        icon: PieChart,
      }
    ]
  },
  {
    title: "Controlo",
    items: [
      {
        name: t.dashboard.sidebar.recurring,
        href: '/recurring',
        icon: Clock,
      },
      {
        name: t.dashboard.sidebar.transactions,
        href: '/transactions',
        icon: Receipt,
      },
      {
        name: t.dashboard.sidebar.categories,
        href: '/categories',
        icon: Tag,
      }
    ]
  },
  {
    title: "Sistema",
    items: [
      {
        name: t.dashboard.sidebar.guide,
        href: '/guide',
        icon: HelpCircle,
      },
      {
        name: t.dashboard.sidebar.billing,
        href: '/billing',
        icon: CreditCard,
      },
      {
        name: t.dashboard.sidebar.settings,
        href: '/settings',
        icon: Settings,
      }
    ]
  },
  {
    title: "Administração",
    isAdminSection: true,
    items: [
      {
        name: "Painel de Comando",
        href: '/admin',
        icon: Shield,
        adminOnly: true
      },
      {
        name: "Tesouraria Global",
        href: '/admin/finance',
        icon: Landmark,
        adminOnly: true
      }
    ]
  }
];

export default function Sidebar({ isCollapsed, onToggle }: { isCollapsed: boolean, onToggle: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation();
  const { user, isPro } = useUser();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = () => {
    const cookieConsent = localStorage.getItem('cookie-consent');
    localStorage.clear();
    sessionStorage.clear();
    if (cookieConsent) {
      localStorage.setItem('cookie-consent', cookieConsent);
    }
    window.location.href = '/auth/login';
  };

  if (!mounted) return null;

  const sections = menuSections(t).map((section) => ({
    ...section,
    items: section.items.filter((item: any) => {
      if (item.adminOnly) {
        return user?.is_admin === true;
      }
      if (isPro) return true;
      // Utilizadores normais só vêem Dashboard e Analytics (ou o que estiver definido)
      return item.href === '/dashboard' || item.href === '/analytics' || item.href === '/settings' || item.href === '/billing' || item.href === '/guide';
    })
  })).filter((section) => section.items.length > 0);

  return (
    <aside 
      className={`fixed left-0 top-0 h-screen bg-[#020617] border-r border-slate-800 transition-all duration-500 ease-[0.16,1,0.3,1] z-50 flex flex-col ${isCollapsed ? 'w-24' : 'w-72'}`}
    >
      <div className={`flex items-center gap-3 mb-10 px-6 py-8 ${isCollapsed ? 'justify-center' : ''}`}>
        <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shrink-0">
          <Sparkles size={20} className="animate-pulse" />
        </div>
        {!isCollapsed && (
          <div className="flex flex-col">
            <span className="text-xl font-black tracking-tighter text-white">
              Finan<span className="text-blue-500 italic">Zen</span>
            </span>
            {isPro && (
              <span className="text-[8px] font-black uppercase tracking-[0.2em] text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full w-fit">
                Mestre Pro
              </span>
            )}
          </div>
        )}
      </div>

      <nav className="flex-1 px-4 space-y-8 overflow-y-auto no-scrollbar">
        {sections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-3">
            {!isCollapsed && (
              <h3 className="px-4 text-[10px] font-black uppercase tracking-[0.3em] text-slate-600">
                {section.title}
              </h3>
            )}
            <div className="space-y-1">
              {section.items.map((item: any) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                const isAdminItem = section.isAdminSection;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-4 p-3.5 rounded-2xl transition-all relative group cursor-pointer ${isActive ? (isAdminItem ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-600/10 text-blue-400') : (isAdminItem ? 'text-amber-500/60 hover:bg-amber-500/5 hover:text-amber-400' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300')} ${isCollapsed ? 'justify-center' : ''} ${isAdminItem ? 'border border-amber-500/10' : ''}`}
                  >
                    <Icon size={20} className={isActive ? (isAdminItem ? 'text-amber-500' : 'text-blue-500') : ''} />
                    {!isCollapsed && (
                      <span className="text-xs font-black uppercase tracking-widest text-inherit">
                        {item.name}
                      </span>
                    )}
                    {isActive && (
                      <div className={`absolute left-0 w-1 h-6 rounded-r-full ${isAdminItem ? 'bg-amber-500' : 'bg-blue-500'}`} />
                    )}
                    {isCollapsed && (
                      <div className="absolute left-full ml-4 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-white opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-2xl">
                        {item.name}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800/50 space-y-4">
        {user && (
          <div className={`flex items-center gap-4 ${isCollapsed ? 'justify-center' : 'px-4 py-2'}`}>
            <div className={`shrink-0 flex items-center justify-center font-black text-white rounded-xl border shadow-lg transition-all ${user.is_admin ? 'bg-gradient-to-br from-amber-500 to-amber-700 border-amber-400/30' : isPro ? 'bg-gradient-to-br from-emerald-500 to-emerald-700 border-emerald-400/30' : 'bg-gradient-to-br from-slate-700 to-slate-900 border-slate-600/30'} w-10 h-10 text-xs`}>
              {user.full_name ? user.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : user.email[0].toUpperCase()}
            </div>
            {!isCollapsed && (
              <div className="flex flex-col gap-0.5 overflow-hidden">
                <p className="text-xs font-black text-white truncate">
                  {user.full_name || user.email.split('@')[0]}
                </p>
                <div className="flex items-center gap-2">
                  <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded-md border ${user.is_admin ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : isPro ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-slate-800 text-slate-400 border-white/5'}`}>
                    {user.is_admin ? 'Root Admin' : isPro ? 'Plano Pro' : 'Plano Free'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
        
        <button
          onClick={handleLogout}
          className={`w-full flex items-center gap-4 p-3.5 rounded-2xl text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-all group cursor-pointer ${isCollapsed ? 'justify-center' : ''}`}
        >
          <LogOut size={20} />
          {!isCollapsed && <span className="text-xs font-black uppercase tracking-widest">Sair</span>}
        </button>
      </div>

      <button 
        onClick={onToggle}
        className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors z-50 shadow-xl"
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </aside>
  );
}
