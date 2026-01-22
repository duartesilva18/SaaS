'use client';

import { motion } from 'framer-motion';

interface SkeletonProps {
  className?: string;
  width?: string;
  height?: string;
}

export function Skeleton({ className = '', width = '100%', height = '1rem' }: SkeletonProps) {
  return (
    <motion.div
      className={`bg-slate-800 rounded animate-pulse ${className}`}
      style={{ width, height }}
      initial={{ opacity: 0.5 }}
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity }}
    />
  );
}

export function TransactionSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="bg-slate-900/40 rounded-2xl p-6 border border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 flex-1">
              <Skeleton width="48px" height="48px" className="rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton width="60%" height="1rem" />
                <Skeleton width="40%" height="0.75rem" />
              </div>
            </div>
            <Skeleton width="80px" height="1.5rem" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="bg-slate-900/40 rounded-2xl p-6 border border-slate-800">
      <div className="space-y-4">
        <Skeleton width="40%" height="1.5rem" />
        <Skeleton width="100%" height="300px" className="rounded-lg" />
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-slate-900/40 rounded-2xl p-6 border border-slate-800">
      <div className="space-y-3">
        <Skeleton width="50%" height="1rem" />
        <Skeleton width="80%" height="2rem" />
        <Skeleton width="30%" height="0.75rem" />
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    </div>
  );
}

