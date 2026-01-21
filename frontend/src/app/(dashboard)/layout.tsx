'use client';

import Sidebar from '@/components/Sidebar';
import OnboardingModal from '@/components/OnboardingModal';
import SupportButton from '@/components/SupportButton';
import LoadingIndicator from '@/components/LoadingIndicator';
import QuickAddTransaction from '@/components/QuickAddTransaction';
import { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/LanguageContext';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/UserContext';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { setCurrency } = useTranslation();
  const { user, loading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/auth/login');
        return;
      }
      
      if (!user.is_onboarded) {
        setShowOnboarding(true);
      }
      
      if (user.currency) {
        setCurrency(user.currency);
      }
    }
  }, [user, loading, router, setCurrency]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex bg-[#020617] min-h-screen relative overflow-hidden selection:bg-blue-500/30">
      {/* Background Glows for all pages */}
      <div className="fixed top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/5 blur-[120px] rounded-full pointer-events-none" />

      {showOnboarding && (
        <OnboardingModal onComplete={() => setShowOnboarding(false)} />
      )}

      <Sidebar 
        isCollapsed={isSidebarCollapsed} 
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
      />
      
      <main className={`flex-1 transition-all duration-500 ease-[0.16,1,0.3,1] ${isSidebarCollapsed ? 'lg:ml-24' : 'lg:ml-72'} p-6 md:p-12 w-full relative z-10 overflow-y-auto h-screen`}>
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>

      <QuickAddTransaction />
      <SupportButton />
      <LoadingIndicator />
    </div>
  );
}
