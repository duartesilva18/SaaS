export const DEMO_TRANSACTIONS = [
  {
    id: 'd1',
    amount_cents: 250000,
    description: 'Salário Mensal',
    category_id: 'income_cat',
    transaction_date: '2026-01-01',
  },
  {
    id: 'd2',
    amount_cents: 85000,
    description: 'Renda Casa',
    category_id: 'rent_cat',
    transaction_date: '2026-01-05',
  },
  {
    id: 'd3',
    amount_cents: 4500,
    description: 'Netflix',
    category_id: 'subs_cat',
    transaction_date: '2026-01-10',
  },
  {
    id: 'd4',
    amount_cents: 12000,
    description: 'Supermercado',
    category_id: 'food_cat',
    transaction_date: '2026-01-12',
  },
  {
    id: 'd5',
    amount_cents: 3500,
    description: 'Jantar Fora',
    category_id: 'food_cat',
    transaction_date: '2026-01-15',
  },
  {
    id: 'd6',
    amount_cents: 50000,
    description: 'Dividendos',
    category_id: 'income_cat',
    transaction_date: '2026-01-18',
  },
  {
    id: 'd7',
    amount_cents: 6500,
    description: 'Gasolina',
    category_id: 'transport_cat',
    transaction_date: '2026-01-20',
  },
];

export const DEMO_CATEGORIES = [
  {
    id: 'income_cat',
    name: 'Rendimentos',
    type: 'income',
    color_hex: '#10b981',
  },
  {
    id: 'rent_cat',
    name: 'Habitação',
    type: 'expense',
    color_hex: '#3b82f6',
  },
  {
    id: 'subs_cat',
    name: 'Subscrições',
    type: 'expense',
    color_hex: '#8b5cf6',
  },
  {
    id: 'food_cat',
    name: 'Alimentação',
    type: 'expense',
    color_hex: '#f59e0b',
  },
  {
    id: 'transport_cat',
    name: 'Transporte',
    type: 'expense',
    color_hex: '#ef4444',
  },
];

export const DEMO_INSIGHTS = {
  insights: [
    {
      type: 'success',
      title: 'Excelente Poupança',
      message: 'Estás a poupar 35% do teu rendimento este mês. Continua assim!',
      icon: 'sparkles',
    },
    {
      type: 'info',
      title: 'Pequenas Despesas',
      message: 'Detetámos 3 subscrições ativas. Podes poupar 15€ se cancelares as que não usas.',
      icon: 'zap',
    },
    {
      type: 'warning',
      title: 'Foco em Alimentação',
      message: 'Os teus gastos em restaurantes subiram 20% face ao mês passado.',
      icon: 'alert-circle',
    },
  ],
  summary: 'O teu ecossistema financeiro está em harmonia estável. Foco na redução de subscrições fantasma.',
  health_score: 85,
};

