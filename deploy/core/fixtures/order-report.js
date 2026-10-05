// Order report: paid sales, grouped revenue and tax, entirely in memory.
// Edit a price or quantity, save, then Run. No files or network are accessed.
const orders = [
  { id: 1001, status: 'paid', category: 'books', region: 'north', quantity: 2, unitPrice: 15 },
  { id: 1002, status: 'paid', category: 'tools', region: 'north', quantity: 1, unitPrice: 45 },
  { id: 1003, status: 'refunded', category: 'books', region: 'south', quantity: 1, unitPrice: 15 },
  { id: 1004, status: 'paid', category: 'books', region: 'south', quantity: 3, unitPrice: 12 },
  { id: 1005, status: 'pending', category: 'tools', region: 'west', quantity: 2, unitPrice: 20 },
  { id: 1006, status: 'paid', category: 'tools', region: 'south', quantity: 2, unitPrice: 9 }
];

function buildReport(rows, taxRate) {
  const seen = new Set();
  const report = { paidOrders: 0, itemCount: 0, revenue: 0,
    tax: 0, averageOrder: 0, byCategory: {}, byRegion: {} };
  for (const order of rows) {
    if (seen.has(order.id)) throw Error(`Duplicate order: ${order.id}`);
    seen.add(order.id);
    if (!Number.isInteger(order.quantity) || order.quantity <= 0)
      throw Error(`Order ${order.id}: quantity must be a positive integer`);
    if (!Number.isFinite(order.unitPrice) || order.unitPrice < 0)
      throw Error(`Order ${order.id}: unit price must be non-negative`);
    if (!['paid', 'pending', 'refunded'].includes(order.status))
      throw Error(`Order ${order.id}: unknown payment status`);
    if (order.status !== 'paid') continue;
    const amount = order.quantity * order.unitPrice;
    report.paidOrders++;
    report.itemCount += order.quantity;
    report.revenue += amount;
    report.byCategory[order.category] = (report.byCategory[order.category] || 0) + amount;
    report.byRegion[order.region] = (report.byRegion[order.region] || 0) + amount;
  }
  const money = value => Math.round((value + Number.EPSILON) * 100) / 100;
  report.revenue = money(report.revenue);
  report.tax = money(report.revenue * taxRate);
  report.averageOrder = report.paidOrders ? money(report.revenue / report.paidOrders) : 0;
  return report;
}

(async () => {
  // Simulated bounded asynchronous work; not a remote data request.
  await new Promise(resolve => setTimeout(resolve, 40));
  return buildReport(orders, 0.08);
})()
