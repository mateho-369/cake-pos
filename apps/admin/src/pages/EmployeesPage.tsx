import { useState } from 'react'
import {
  Check,
  KeyRound,
  MoreHorizontal,
  Plus,
  ShieldCheck,
  UserCog,
} from 'lucide-react'
import { useAdminData } from '../lib/data'
import Modal from '../components/Modal'
import { useTranslation } from '../lib/i18n'

export default function EmployeesPage({
  onToast,
}: {
  onToast: (message: string) => void
}) {
  const { t } = useTranslation()
  const { employees, createEmployee } = useAdminData()
  const [open, setOpen] = useState(false)
  const [accessOpen, setAccessOpen] = useState(false)
  const submitEmployee = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await createEmployee({
      name: String(form.get('name') || ''),
      email: String(form.get('email') || ''),
      role: String(form.get('role') || 'Cashier'),
      password: String(form.get('password') || ''),
      pin_code: String(form.get('pin_code') || ''),
    })
    setOpen(false)
    onToast(t('employees.employeeCreated'))
  }
  return (
    <div className="page-content">
      <section className="page-toolbar">
        <div className="toolbar-context">
          <strong>
            {t('employees.teamCount', { count: employees.length })}
          </strong>
          <span>
            {t('employees.clockedIn', {
              count: employees.filter(
                (employee) => employee.status === 'On shift',
              ).length,
            })}
          </span>
        </div>
        <div className="toolbar-actions">
          <button
            className="secondary-button"
            onClick={() => setAccessOpen(true)}
          >
            <ShieldCheck size={16} /> {t('employees.roles')}
          </button>
          <button className="primary-button" onClick={() => setOpen(true)}>
            <Plus size={17} /> {t('employees.add')}
          </button>
        </div>
      </section>
      <section className="employee-grid">
        {employees.map((employee, index) => (
          <article className="glass-panel employee-card" key={employee.name}>
            <div className="employee-card-head">
              <span className={`employee-avatar e${index}`}>
                {employee.initials}
              </span>
              <button className="icon-button" aria-label={t('common.edit')}>
                <MoreHorizontal size={18} />
              </button>
            </div>
            <h3>{employee.name}</h3>
            <span className="role-label">{roleLabel(t, employee.role)}</span>
            <span
              className={`employee-status ${employeeStatusClass(employee.status)}`}
            >
              <i />
              {employeeStatus(t, employee.status)}
            </span>
            <div className="employee-shift">
              <span>{t('employees.currentShift')}</span>
              <strong>{shiftLabel(t, employee.shift)}</strong>
            </div>
            <div className="employee-metrics">
              <div>
                <span>{t('employees.salesToday')}</span>
                <strong>${employee.sales}</strong>
              </div>
              <div>
                <span>{t('employees.orders')}</span>
                <strong>{employee.orders || '—'}</strong>
              </div>
            </div>
            <button
              className="secondary-button full-button"
              onClick={() =>
                onToast(t('employees.profileOpened', { name: employee.name }))
              }
            >
              <UserCog size={16} /> {t('employees.manage')}
            </button>
          </article>
        ))}
      </section>
      <section className="glass-panel access-activity">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">{t('employees.security')}</span>
            <h2>{t('employees.shiftActivity')}</h2>
          </div>
        </div>
        <div className="access-row table-head">
          <span>{t('employees.employee')}</span>
          <span>{t('employees.event')}</span>
          <span>{t('dashboard.time')}</span>
          <span>{t('employees.result')}</span>
        </div>
        {employees.map((employee) => {
          const onShift = employee.status === 'On shift'
          const hasShift = employee.shift !== 'No shift recorded'
          const startTime = hasShift ? employee.shift.split(' – ')[0] : '—'
          return (
            <div className="access-row" key={employee.id}>
              <strong>{employee.name}</strong>
              <span>
                {onShift
                  ? t('employees.shiftOpened')
                  : hasShift
                    ? t('employees.shiftClosed')
                    : t('employees.noShift')}
              </span>
              <span>{hasShift ? startTime : '—'}</span>
              <span
                className={`status-badge ${onShift ? 'success' : 'neutral'}`}
              >
                <i />
                {employeeStatus(t, employee.status)}
              </span>
            </div>
          )
        })}
        {employees.length === 0 && (
          <div className="empty-state">
            <UserCog size={24} />
            <strong>{t('employees.noEmployees')}</strong>
          </div>
        )}
      </section>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        eyebrow={t('employees.account')}
        title={t('employees.add')}
        size="medium"
      >
        <form className="modal-form" onSubmit={submitEmployee}>
          <div className="form-section-title">
            <span>{t('employees.accountDetails')}</span>
            <small>{t('employees.accountHelp')}</small>
          </div>
          <div className="form-grid two-columns">
            <label>
              <span>{t('employees.fullName')}</span>
              <input
                name="name"
                placeholder={t('employees.employeePlaceholder')}
                required
              />
            </label>
            <label>
              <span>{t('employees.role')}</span>
              <select name="role">
                <option value="cashier">{t('employees.cashier')}</option>
                <option value="admin">{t('employees.admin')}</option>
              </select>
            </label>
            <label>
              <span>{t('employees.email')}</span>
              <input
                name="email"
                type="email"
                placeholder={t('employees.emailPlaceholder')}
                required
              />
            </label>
            <label>
              <span>{t('employees.temporaryPassword')}</span>
              <input
                name="password"
                type="password"
                defaultValue="TempPass123!"
                required
              />
            </label>
          </div>
          <div className="pin-setup">
            <div className="pin-icon">
              <KeyRound size={19} />
            </div>
            <div>
              <strong>{t('employees.quickLoginPin')}</strong>
              <span>{t('employees.pinHelp')}</span>
            </div>
            <input
              name="pin_code"
              inputMode="numeric"
              maxLength={4}
              placeholder="••••"
              required
            />
          </div>
          <label className="toggle-field">
            <span>
              <strong>{t('employees.activeImmediately')}</strong>
              <small>{t('employees.activeHelp')}</small>
            </span>
            <input type="checkbox" defaultChecked />
            <i />
          </label>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setOpen(false)}
            >
              {t('common.cancel')}
            </button>
            <button className="primary-button">
              <Plus size={16} /> {t('employees.createAccount')}
            </button>
          </div>
        </form>
      </Modal>
      <Modal
        open={accessOpen}
        onClose={() => setAccessOpen(false)}
        eyebrow={t('employees.accessControl')}
        title={t('employees.roles')}
        size="large"
      >
        <div className="permission-matrix table-responsive">
          <div className="permission-row table-head">
            <span>{t('employees.capability')}</span>
            <span>{t('employees.permissionAdmin')}</span>
            <span>{t('employees.permissionCashier')}</span>
          </div>
          {[
            ['Process sales & KHQR', true, true],
            ['Apply discounts', true, true],
            ['Refund completed orders', true, false],
            ['Manage products and price', true, false],
            ['Record waste', true, true],
            ['Manage employees', true, false],
            ['View reports and profit', true, false],
            ['Edit business settings', true, false],
          ].map(([label, admin, cashier]) => (
            <div className="permission-row" key={String(label)}>
              <strong>{permissionLabel(t, String(label))}</strong>
              <span className={admin ? 'allowed' : ''}>
                {admin && <Check size={16} />}
              </span>
              <span className={cashier ? 'allowed' : ''}>
                {cashier && <Check size={16} />}
              </span>
            </div>
          ))}
        </div>
        <div className="form-notice">
          <ShieldCheck size={18} />
          <span>{t('employees.permissionNotice')}</span>
        </div>
        <div className="modal-actions">
          <button
            className="primary-button"
            onClick={() => setAccessOpen(false)}
          >
            {t('common.done')}
          </button>
        </div>
      </Modal>
    </div>
  )
}
function shiftLabel(t: (key: string) => string, value: string) {
  return value === 'No shift recorded'
    ? value
    : value.replace('now', t('employees.now'))
}
function roleLabel(t: (key: string) => string, value: string) {
  return value === 'Owner · Admin'
    ? t('employees.ownerAdmin')
    : value === 'Cashier'
      ? t('employees.cashier')
      : value
}
function employeeStatusClass(status: string) {
  if (status === 'On shift') return 'on-shift'
  if (status === 'Active') return 'active'
  return 'inactive'
}

function employeeStatus(t: (key: string) => string, value: string) {
  return value === 'On shift'
    ? t('employees.onShift')
    : value === 'Active'
      ? t('common.active')
      : t('employees.inactive')
}
function permissionLabel(t: (key: string) => string, value: string) {
  const map: Record<string, string> = {
    'Process sales & KHQR': 'permissionSales',
    'Apply discounts': 'permissionDiscounts',
    'Refund completed orders': 'permissionRefunds',
    'Manage products and price': 'permissionProducts',
    'Record waste': 'permissionWaste',
    'Manage employees': 'permissionEmployees',
    'View reports and profit': 'permissionReports',
    'Edit business settings': 'permissionSettings',
  }
  return t(`employees.${map[value]}`)
}
