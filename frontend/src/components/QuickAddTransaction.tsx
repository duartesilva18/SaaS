'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, X, Sparkles, Plus, Calendar, Tag, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { useTranslation } from '@/lib/LanguageContext';
import api from '@/lib/api';
import Toast from '@/components/Toast';

export default function QuickAddTransaction() {
  const { t, currency } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    amount: '',
    description: '',
    category_id: '',
    transaction_date: new Date().toISOString().split('T')[0],
    type: 'expense'
  });
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  useEffect(() => {
    if (isOpen) {
      fetchCategories();
    }
  }, [isOpen]);

  const fetchCategories = async () => {
    try {
      const res = await api.get('/categories/');
      setCategories(res.data);
      if (res.data.length > 0 && !formData.category_id) {
        setFormData((prev) => ({
          ...prev,
          category_id: res.data[0].id
        }));
      }
    } catch (err) {
      console.error("Erro ao carregar categorias:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/transactions/', {
        amount_cents: Math.round(parseFloat(formData.amount) * 100) * (formData.type === 'expense' ? -1 : 1),
        description: formData.description,
        category_id: formData.category_id,
        transaction_date: formData.transaction_date
      });
      setToastMsg("Transação registada com sucesso!");
      setToastType('success');
      setShowToast(true);
      setIsOpen(false);
      setFormData({
        amount: '',
        description: '',
        category_id: categories[0]?.id || '',
        transaction_date: new Date().toISOString().split('T')[0],
        type: 'expense'
      });
      window.dispatchEvent(new Event('transaction-added'));
    } catch (err) {
      setToastMsg("Erro ao registar transação.");
      setToastType('error');
      setShowToast(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.1, rotate: 12 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-8 w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-full shadow-[0_0_20px_rgba(37,99,235,0.4)] flex items-center justify-center z-40 cursor-pointer group border border-white/10"
      >
        <Zap size={24} className="fill-current" />
        <div className="absolute right-full mr-4 px-3 py-1 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-slate-800 pointer-events-none">
          Registo Rápido
        </div>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-[#020617]/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
                      <Sparkles size={20} />
                    </div>
                    <h2 className="text-xl font-black text-white uppercase tracking-tighter">
                      Registo Manual
                    </h2>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="text-slate-500 hover:text-white transition-colors cursor-pointer"
                  >
                    <X size={20} />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-2 gap-4 mb-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, type: 'expense' })}
                      className={`py-3 rounded-2xl flex items-center justify-center gap-2 font-black uppercase tracking-widest text-[10px] transition-all ${formData.type === 'expense' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-slate-800/50 text-slate-500 grayscale'}`}
                    >
                      <ArrowDownCircle size={14} />
                      Despesa
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, type: 'income' })}
                      className={`py-3 rounded-2xl flex items-center justify-center gap-2 font-black uppercase tracking-widest text-[10px] transition-all ${formData.type === 'income' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800/50 text-slate-500 grayscale'}`}
                    >
                      <ArrowUpCircle size={14} />
                      Receita
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="relative">
                      <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 font-black">
                        {currency === 'EUR' ? '€' : currency === 'BRL' ? 'R$' : '$'}
                      </div>
                      <input
                        required
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl pl-12 pr-6 py-4 text-2xl font-black text-white focus:outline-none focus:border-blue-500 transition-all"
                      />
                    </div>

                    <input
                      required
                      type="text"
                      placeholder="Descrição (ex: Almoço Zen)"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-blue-500 transition-all placeholder:text-slate-600"
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <div className="relative">
                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                        <input
                          type="date"
                          value={formData.transaction_date}
                          onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
                          className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl pl-12 pr-4 py-4 text-xs font-bold text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div className="relative">
                        <Tag className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                        <select
                          value={formData.category_id}
                          onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                          className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl pl-12 pr-4 py-4 text-xs font-bold text-white focus:outline-none focus:border-blue-500 appearance-none"
                        >
                          {categories.filter((c) => c.type === formData.type).map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <button
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-xs transition-all active:scale-95 shadow-xl shadow-blue-600/20 flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        Confirmar Registo
                        <Plus size={18} />
                      </>
                    )}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Toast
        message={toastMsg}
        onClose={() => setShowToast(false)}
        type={toastType}
        isVisible={showToast}
      />
    </>
  );
}

