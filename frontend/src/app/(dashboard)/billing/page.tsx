'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '@/lib/LanguageContext';
import api from '@/lib/api';
import { 
  CreditCard, Calendar, Clock, CheckCircle2, 
  AlertCircle, ExternalLink, Download, ArrowRight,
  ShieldCheck, Wallet, Sparkles, FileText, ChevronRight
} from 'lucide-react';

interface Invoice {
  id: string;
  amount_paid: number;
  currency: string;
  status: string;
  created: number;
  invoice_pdf: string;
  number: string;
}

interface SubscriptionData {
  status: string;
  current_period_end?: number;
  plan_name?: string;
}

export default function BillingPage() {
  const { t, formatCurrency } = useTranslation();
  const b = t.dashboard.billing;
  
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [subData, setSubData] = useState<SubscriptionData | null>(null);
  const [isSimulated, setIsSimulated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [invRes, userRes] = await Promise.all([
          api.get('/stripe/invoices'),
          api.get('/auth/me')
        ]);
        
        setInvoices(invRes.data);
        const userStatus = userRes.data.subscription_status;
        const customerId = userRes.data.stripe_customer_id || '';
        
        setIsSimulated(customerId.startsWith('sim_') || customerId.startsWith('test_'));
        setSubData({
          status: userStatus,
          plan_name: userStatus === 'active' ? 'Plano Pro' : 'Plano Base'
        });
      } catch (err) {
        console.error("Erro ao carregar dados de faturação:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handlePortal = async () => {
    if (isSimulated) {
      alert("Estás em modo de simulação. O portal Stripe só está disponível para subscrições reais.");
      return;
    }
    try {
      const res = await api.post('/stripe/portal');
      window.location.href = res.data.url;
    } catch (err) {
      alert("Não foi possível abrir o portal Stripe.");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'text-emerald-400 bg-emerald-500/10';
      case 'open': return 'text-amber-400 bg-amber-500/10';
      case 'void': return 'text-slate-500 bg-slate-500/10';
      default: return 'text-red-400 bg-red-500/10';
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">A carregar histórico...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-12 pb-20 px-4 md:px-8">
      {/* Header */}
      <section className="relative">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 px-4 py-1.5 rounded-full text-blue-400 text-[10px] font-black uppercase tracking-widest">
              <ShieldCheck size={14} /> Faturação Segura
            </div>
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-white uppercase leading-none">
              {b.title}<span className="text-blue-500 italic">{b.titleAccent}</span>
            </h1>
            <p className="text-slate-500 font-medium max-w-xl">{b.subtitle}</p>
          </div>

          <button 
            onClick={handlePortal}
            className="group flex items-center gap-3 px-8 py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-[24px] font-black uppercase tracking-widest text-xs transition-all shadow-2xl shadow-blue-600/30 active:scale-95 cursor-pointer"
          >
            {b.manage}
            <ExternalLink size={16} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </section>

      {/* Subscription Card */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-8 rounded-[40px] flex flex-col justify-between group overflow-hidden relative"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-[50px] rounded-full -mr-16 -mt-16" />
          <div className="relative z-10">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{b.currentPlan}</p>
            <h3 className="text-3xl font-black text-white uppercase tracking-tighter">{subData?.plan_name}</h3>
          </div>
          <div className="mt-8 relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 rounded-full text-blue-400 text-[10px] font-bold">
              <Sparkles size={12} /> Benefícios Ativos
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-8 rounded-[40px] flex flex-col justify-between group overflow-hidden relative"
        >
          <div className="relative z-10">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{b.status}</p>
            <div className={`inline-flex items-center gap-2 text-xl font-black uppercase tracking-tighter px-4 py-2 rounded-2xl ${
              subData?.status === 'active' ? 'text-emerald-400 bg-emerald-500/10' : 'text-amber-400 bg-amber-500/10'
            }`}>
              {subData?.status === 'active' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              {b.states[subData?.status as keyof typeof b.states] || subData?.status}
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-8 rounded-[40px] flex flex-col justify-between group overflow-hidden relative"
        >
          <div className="relative z-10">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{b.nextPayment}</p>
            <div className="flex items-center gap-3 text-white font-black text-xl tracking-tighter uppercase">
              <Calendar size={20} className="text-blue-500" />
              {isSimulated ? 'Modo Demo' : 'Ver no Portal'}
            </div>
          </div>
          <p className="text-[10px] font-medium text-slate-500 mt-4 uppercase">
            {isSimulated ? 'Sem renovação real' : 'Renovação automática ativa'}
          </p>
        </motion.div>
      </section>

      {/* Invoices Table */}
      <section className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-[48px] overflow-hidden shadow-2xl">
        <div className="p-8 md:p-12">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-8 flex items-center gap-2">
            <FileText size={14} /> Histórico de Transações Stripe
          </h2>

          {invoices.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center opacity-50">
              <Clock size={48} className="text-slate-700 mb-4" />
              <p className="text-slate-500 font-medium">{b.noInvoices}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="pb-6 text-[10px] font-black uppercase tracking-widest text-slate-500">{b.table.date}</th>
                    <th className="pb-6 text-[10px] font-black uppercase tracking-widest text-slate-500">{b.table.amount}</th>
                    <th className="pb-6 text-[10px] font-black uppercase tracking-widest text-slate-500">{b.table.status}</th>
                    <th className="pb-6 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">{b.table.invoice}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-sm">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="group hover:bg-white/5 transition-colors">
                      <td className="py-6 font-medium text-slate-300">
                        {new Date(inv.created * 1000).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="py-6 font-black text-white">
                        {formatCurrency(inv.amount_paid / 100)}
                      </td>
                      <td className="py-6">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${getStatusColor(inv.status)}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-6 text-right">
                        <a 
                          href={inv.invoice_pdf} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-blue-500 hover:text-blue-400 font-black text-[10px] uppercase tracking-widest group-hover:translate-x-1 transition-transform"
                        >
                          PDF <Download size={14} />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Info Banner */}
      <section className="bg-blue-600/5 border border-blue-500/10 rounded-[40px] p-8 flex flex-col md:flex-row items-center gap-6">
        <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 shrink-0">
          <ShieldCheck size={24} />
        </div>
        <p className="text-slate-400 text-sm font-medium flex-1">
          As tuas faturas são processadas pelo **Stripe**. Podes descarregar o recibo oficial em PDF para cada transação acima. Para alterar o método de pagamento, usa o botão **"Gerir no Stripe"**.
        </p>
      </section>
    </div>
  );
}

