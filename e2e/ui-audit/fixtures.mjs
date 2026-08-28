/**
 * Realistic API fixtures for the admin UI audit harness.
 * All cross-referenced numbers are derived from ONE sale of 2 x $10.00
 * (order CS-1001) so consistency checks are meaningful:
 *   - net sales today: $20.00
 *   - products: 3 (one expiring today with 2 units @ $12, one fresh, one sold out)
 *   - shift: open since 08:00, opening float $100, expected drawer $120
 */
const now = new Date('2026-08-27T10:30:00')

export const products = [
  {
    id: 1,
    name: 'Vanilla Celebration',
    category: 'Signature',
    categoryId: 1,
    price: 12,
    stock: 2,
    sold: 4,
    revenue: 48,
    status: 'Expires today',
    madeAt: 'Aug 26, 2026',
    bestBefore: 'Aug 27, 2026',
    imagePosition: '0% 0%',
    imageUrl: 'http://cdn.test/product-images/vanilla.jpg',
    images: [{ id: 1, url: 'http://cdn.test/product-images/vanilla.jpg', caption: '', sortOrder: 0 }],
    active: true,
    orderItemReferences: 4,
    hideWhenOutOfStock: false,
  },
  {
    id: 2,
    name: 'Chocolate Fudge',
    category: 'Signature',
    categoryId: 1,
    price: 10,
    stock: 6,
    sold: 2,
    revenue: 20,
    status: 'Fresh',
    madeAt: 'Aug 27, 2026',
    bestBefore: 'Aug 30, 2026',
    imagePosition: '50% 50%',
    imageUrl: null,
    images: [],
    active: true,
    orderItemReferences: 2,
    hideWhenOutOfStock: false,
  },
  {
    id: 3,
    name: 'Test Mistake Cake',
    category: 'Seasonal',
    price: 5,
    stock: 1,
    sold: 0,
    revenue: 0,
    status: 'Fresh',
    madeAt: 'Aug 27, 2026',
    bestBefore: 'Aug 30, 2026',
    imagePosition: '100% 100%',
    imageUrl: null,
    images: [],
    active: true,
    orderItemReferences: 0,
    hideWhenOutOfStock: false,
  },
]

export const categories = [
  { id: 1, name: 'Signature', parentId: null, parentName: null, items: 2, active: 1, revenue: 68, color: '#be185d', sortOrder: 0 },
  { id: 2, name: 'Seasonal', parentId: null, parentName: null, items: 1, active: 1, revenue: 0, color: '#3b82f6', sortOrder: 1 },
  { id: 3, name: 'Latte', parentId: 2, parentName: 'Seasonal', items: 0, active: 0, revenue: 0, color: '#d97706', sortOrder: 2 },
]

export const orders = [
  {
    id: 'CS-1001',
    time: '9:12 AM',
    date: 'Today',
    createdAt: '2026-08-27T09:12:00Z',
    cashier: 'Sophea Chan',
    customer: null,
    customerId: null,
    source: 'walk-in',
    items: 2,
    subtotal: 20,
    discountType: null,
    discountValue: null,
    discountAmount: 0,
    total: 20,
    payment: 'Cash',
    status: 'Completed',
    detail: ['2 × Chocolate Fudge'],
  },
  {
    id: 'TG-502',
    time: '10:02 AM',
    date: 'Today',
    createdAt: '2026-08-27T10:02:00Z',
    cashier: '',
    customer: { name: 'Srey Neang', phone: '+855 12 345 678', telegram_username: 'sreyneang' },
    customerId: 1,
    source: 'telegram',
    items: 1,
    subtotal: 12,
    discountType: null,
    discountValue: null,
    discountAmount: 0,
    total: 12,
    payment: null,
    status: 'Pending',
    detail: ['1 × Vanilla Celebration'],
  },
]

export const employees = [
  { id: 1, name: 'Makara Piseth', initials: 'MP', email: 'owner@atelier.local', role: 'Owner · Admin', status: 'Active', shift: 'No shift recorded', sales: 0, orders: 0 },
  { id: 2, name: 'Sophea Chan', initials: 'SC', email: 'sophea@atelier.local', role: 'Cashier', status: 'On shift', shift: '8:00 AM – now', sales: 20, orders: 1 },
  { id: 3, name: 'Dara Lim', initials: 'DL', email: 'dara@atelier.local', role: 'Cashier', status: 'Active', shift: 'No shift recorded', sales: 0, orders: 0 },
]

export const customers = [
  {
    id: 1,
    telegramUserId: '77001',
    name: 'Srey Neang',
    phone: '+855 12 345 678',
    telegramUsername: 'sreyneang',
    firstSeenAt: '2026-08-20T09:00:00Z',
    totalOrders: 3,
    totalSpent: 44.5,
  },
]

export const shifts = [
  {
    id: 11,
    employeeId: 2,
    openingCash: 100,
    openedAt: '2026-08-27T08:00:00Z',
    status: 'Open',
    openingCashUsdCents: 10000,
    openingCashKhr: 0,
    expectedCashUsdCents: 12000,
    expectedCashKhr: 0,
    cashSalesUsdCents: 2000,
    cashSalesKhr: 0,
    openedBy: 'Sophea Chan',
  },
  {
    id: 10,
    employeeId: 3,
    openingCash: 80,
    closingCash: 132.5,
    openedAt: '2026-08-26T08:00:00Z',
    closedAt: '2026-08-26T17:30:00Z',
    status: 'Closed',
    openingCashUsdCents: 8000,
    openingCashKhr: 0,
    expectedCashUsdCents: 13250,
    expectedCashKhr: 0,
    closingCashUsdCents: 13250,
    closingCashKhr: 0,
    varianceUsdCents: 0,
    varianceKhr: 0,
    openedBy: 'Dara Lim',
  },
]

export const currentShift = shifts[0]

export const summary = {
  todaySalesTotal: 20,
  todayOrdersCount: 1,
  grossSalesCents: 2000,
  totalDiscountsCents: 0,
  netSalesBeforeCorrectionsCents: 2000,
  refundsCents: 0,
  voidsCents: 0,
  netRevenueCents: 2000,
  completedOrderCount: 1,
  heldOrderCount: 0,
  averageOrderValueCents: 2000,
  cashRevenueCents: 2000,
  qrRevenueCents: 0,
  yesterdaySalesTotal: 52.5,
  yesterdayOrdersCount: 4,
  itemsSold: 2,
  qrPaymentCount: 0,
  ordersData: [
    { day: '2026-08-21', value: 12 },
    { day: '2026-08-22', value: 18 },
    { day: '2026-08-23', value: 9 },
    { day: '2026-08-24', value: 24 },
    { day: '2026-08-25', value: 15 },
    { day: '2026-08-26', value: 52.5 },
    { day: '2026-08-27', value: 1 },
  ],
  revenueData: [
    { day: '2026-08-21', value: 12 },
    { day: '2026-08-22', value: 18 },
    { day: '2026-08-23', value: 9 },
    { day: '2026-08-24', value: 24 },
    { day: '2026-08-25', value: 15 },
    { day: '2026-08-26', value: 52.5 },
    { day: '2026-08-27', value: 20 },
  ],
  topProducts: [
    { id: 2, name: 'Chocolate Fudge', category: 'Signature', units: 2, revenue: 20 },
  ],
}

export const freshness = {
  totalUnits: 9,
  freshUnits: 7,
  freshValueCents: 7250,
  freshPercent: 78,
  expiresTodayUnits: 2,
  expiresTodayValueCents: 2400,
  expiresTomorrowUnits: 0,
  expiresTomorrowValueCents: 0,
  expiredUnits: 0,
  expiredValueCents: 0,
  wasteThisWeekCents: 1200,
  wasteLastWeekCents: 0,
  wasteDeltaPercent: null,
  dailyWaste: [{ day: '2026-08-26', value: 12 }],
  events: [
    {
      id: 1,
      productName: 'Vanilla Celebration',
      category: 'Signature',
      quantity: 1,
      reason: 'damaged',
      retailValue: 12,
      recordedAt: '2026-08-26T16:20:00Z',
      recordedBy: 'Sophea Chan',
    },
  ],
  lastRecordedAt: '2026-08-26T16:20:00Z',
}

// The Media Library scenario from the owner's report: an in-use object of
// 13,926 bytes renders as "13.6 KB".
export const media = {
  totalBytes: 13926 + 8200 + 45123,
  objectCount: 3,
  objects: [
    {
      key: 'product-images/vanilla.jpg',
      url: 'http://cdn.test/product-images/vanilla.jpg',
      size: 13926,
      lastModified: Math.floor(now.getTime() / 1000) - 86400,
      status: 'in_use',
      usedBy: ['product: Vanilla Celebration'],
    },
    {
      key: 'product-images/old-banner.jpg',
      url: 'http://cdn.test/product-images/old-banner.jpg',
      size: 8200,
      lastModified: Math.floor(now.getTime() / 1000) - 3 * 86400,
      status: 'inactive_product',
      usedBy: ['product: Retired Special'],
    },
    {
      key: 'product-images/stray-upload.jpg',
      url: 'http://cdn.test/product-images/stray-upload.jpg',
      size: 45123,
      lastModified: Math.floor(now.getTime() / 1000) - 7 * 86400,
      status: 'orphaned',
      usedBy: [],
    },
  ],
}

export const posRules = {
  maxCashierDiscountPercent: 10,
  khqrImageUrl: '',
  exchangeRateKhrPerUsd: 4100,
  khrRoundingIncrement: 100,
  shiftClosingPolicy: 'opener_or_admin',
  staffNotificationChatId: '',
  defaultShelfLifeDays: 3,
  warningDays: 1,
}

export const businessProfile = {
  businessName: 'G-Cake Atelier',
  locationName: 'BKK1',
  address: 'Street 63, Phnom Penh',
  phone: '+855 23 000 000',
  timezone: 'Asia/Phnom_Penh',
  primaryCurrency: 'USD',
  secondaryCurrency: 'none',
}

export const receiptTemplate = {
  paperSize: '80mm',
  language: 'en',
  businessName: 'G-Cake Atelier',
  address: 'Street 63, Phnom Penh',
  logoUrl: '',
  footerMessage: 'Thank you!',
}

export const broadcasts = [
  {
    id: 1,
    caption: 'New arrival: Chocolate Fudge!',
    imageUrl: 'http://cdn.test/product-images/fudge-poster.jpg',
    sentAt: '2026-08-26T09:00:00Z',
    recipientCount: 12,
    successCount: 11,
    failureCount: 1,
  },
]

export const broadcastTemplates = [
  { id: 1, name: 'New arrival pink', imageUrl: 'http://cdn.test/tpl.jpg', caption: 'Fresh out of the oven!' },
]
