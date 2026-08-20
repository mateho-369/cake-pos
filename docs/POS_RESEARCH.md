# Professional POS research and product decisions

This note captures the product research used to make the Admin Control interface operational rather than decorative.

## Patterns from established POS products

### Square

Square frames its dashboard as the business headquarters: transaction/deposit visibility, sales reporting, inventory, employee permissions, and digestible analytics. The useful lesson is that an owner dashboard should answer “what needs action?” without requiring spreadsheet work.

Source: [Square Business Dashboards](https://squareup.com/au/en/point-of-sale/features/dashboard)

### Toast

Toast's retail back office puts top sellers and high-level inventory statistics on the dashboard, then connects item management, purchasing, reporting, employee access, taxes, and payment settings. Toast's restaurant inventory tooling further emphasizes inventory value, recipe cost, actual-versus-theoretical use, mobile counts, and waste/shrinkage.

Sources:

- [Toast Retail overview](https://support.toasttab.com/en/article/Get-Started-Toast-for-Restaurant-Retail)
- [Toast inventory management](https://pos.toasttab.com/products/inventory-management)

### Lightspeed

Lightspeed's analytics model includes sales versus goals, average sale, basket size, sell-through, inventory turns, out-of-stock items, category performance, margins, and employee performance. The key product lesson is to pair revenue with operational drivers—not show revenue alone.

Sources:

- [Navigating Lightspeed Analytics](https://retail-support.lightspeedhq.com/hc/en-us/articles/4410640218523-Navigating-Lightspeed-Analytics)
- [Lightspeed Analytics reports](https://lightspeedanalytics.net/documentation)

### Bakery-specific operations

A bakery differs from ordinary retail because finished goods and ingredients are perishable and production transforms ingredients into batches. Strong bakery systems use batch/lot dates, FEFO rotation, waste reasons, recipe-based ingredient depletion, production planning, cost/margin analysis, and recall traceability.

Sources:

- [Bakery management capabilities and FEFO](https://wherefour.com/best-bakery-management-software/)
- [Bakery recipe, batch, expiry, and costing requirements](https://craftybase.com/bakery-inventory-software)

## Decisions applied to this project

| Research finding | Admin Control decision |
|---|---|
| Owners need exceptions, not vanity metrics | Dashboard leads with freshness risk, shift status, cash position, and live payment confirmation alongside revenue |
| Perishables should be sold FEFO | Dedicated Freshness Queue ranks stock by expiry and can flag items on the sale terminal |
| Waste must be explainable | Waste records require quantity and reason and create an inventory/audit adjustment |
| Price and inventory changes require control | Product view exposes stock, price, active status, batch dates, and an edit workflow |
| Payments must reconcile to shifts | Cash expected/count/variance and KHQR manual confirmations are visible in Shifts |
| Staff access should be role-based | Admin-created accounts, PINs, permission matrix, and access activity are first-class features |
| Reports should connect sales to drivers | Sales, gross margin, category contribution, product profitability, payment, team, and waste reports are represented |
| Fast item creation matters in a fresh bakery | Add Cake is photo-first with only essential fields and an automatic best-before date |

## Scope tiers

### Phase 1 / current product model

- Sale, payment, receipt, refund entry point
- Finished-product stock and expiry
- FEFO freshness queue and waste record
- Product/category/employee/shift/settings administration
- Cash and KHQR reconciliation
- Core sales, product, employee, and waste reporting

### Recommended after Phase 1 is stable

1. **Recipe and ingredient inventory:** ingredients, units, recipes, yield, production batches, supplier lots, actual-vs-theoretical usage, and COGS.
2. **Production planning:** recommended bake quantities based on weekday/product demand and outstanding custom orders.
3. **Custom cake orders:** customer/contact details, design notes, pickup date/time, deposit, balance, production status, and handoff proof.
4. **Supplier and purchasing:** supplier catalog, price history, reorder points, purchase orders, receiving, and ingredient expiry.
5. **Audit and controls:** immutable event log, approval thresholds for discounts/refunds, session revocation, and anomaly alerts.
6. **Multi-location readiness:** location-scoped stock, transfers, employees, registers, and consolidated reports if the business expands.

These are deliberately not mixed into the customer self-order storefront. That remains Phase 2, as required by the project blueprint.

## Professional interface principles

- Use pink as a restrained brand accent; data and controls remain neutral and high-contrast.
- Keep operational density high without compressing tap targets.
- Put status next to the object it affects: expiry on products, confirmation on payments, variance on shifts.
- Prefer explicit labels to decorative icon-only actions for high-risk workflows.
- Require confirmation and a reason for destructive financial/inventory actions.
- Preserve the audit trail; archive rather than erase business records.
- Show empty, loading, error, conflict, and retry states when real API wiring begins.
