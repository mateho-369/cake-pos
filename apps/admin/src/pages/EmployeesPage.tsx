import { useState } from 'react'
import { Check, KeyRound, MoreHorizontal, Plus, ShieldCheck, UserCog, Users } from 'lucide-react'
import { employees } from '../data'
import Modal from '../components/Modal'

export default function EmployeesPage({ onToast }: { onToast: (message: string) => void }) {
  const [open, setOpen] = useState(false)
  const [accessOpen, setAccessOpen] = useState(false)

  const createEmployee = (event: React.FormEvent) => {
    event.preventDefault()
    setOpen(false)
    onToast('Employee account created')
  }

  return (
    <div className="page-content">
      <section className="page-toolbar">
        <div className="toolbar-context"><strong>4 team members</strong><span>2 people are currently clocked in.</span></div>
        <div className="toolbar-actions"><button className="secondary-button" onClick={() => setAccessOpen(true)}><ShieldCheck size={16} /> Roles & permissions</button><button className="primary-button" onClick={() => setOpen(true)}><Plus size={17} /> Add employee</button></div>
      </section>

      <section className="employee-grid">
        {employees.map((employee, index) => (
          <article className="glass-panel employee-card" key={employee.name}>
            <div className="employee-card-head"><span className={`employee-avatar e${index}`}>{employee.initials}</span><button className="icon-button"><MoreHorizontal size={18} /></button></div>
            <h3>{employee.name}</h3><span className="role-label">{employee.role}</span>
            <span className={`employee-status ${employee.status === 'On shift' ? 'on-shift' : employee.status === 'Active' ? 'active' : 'inactive'}`}><i />{employee.status}</span>
            <div className="employee-shift"><span>Current / latest shift</span><strong>{employee.shift}</strong></div>
            <div className="employee-metrics"><div><span>Sales today</span><strong>${employee.sales}</strong></div><div><span>Orders</span><strong>{employee.orders || '—'}</strong></div></div>
            <button className="secondary-button full-button" onClick={() => onToast(`${employee.name}'s profile opened`)}><UserCog size={16} /> Manage account</button>
          </article>
        ))}
      </section>

      <section className="glass-panel access-activity">
        <div className="panel-heading"><div><span className="section-kicker">Security</span><h2>Recent access activity</h2></div><button className="text-button">View audit log</button></div>
        <div className="access-row table-head"><span>Employee</span><span>Event</span><span>Device</span><span>Time</span><span>Result</span></div>
        <div className="access-row"><strong>Sophea Chan</strong><span>Sale terminal PIN login</span><span>iPad · BKK1</span><span>Today, 7:54 AM</span><span className="status-badge success"><i />Success</span></div>
        <div className="access-row"><strong>Dara Lim</strong><span>Sale terminal PIN login</span><span>Chrome · BKK1</span><span>Today, 8:01 AM</span><span className="status-badge success"><i />Success</span></div>
        <div className="access-row"><strong>Makara Piseth</strong><span>Admin password login</span><span>Safari · Phnom Penh</span><span>Today, 8:17 AM</span><span className="status-badge success"><i />Success</span></div>
      </section>

      <Modal open={open} onClose={() => setOpen(false)} eyebrow="Team account" title="Add employee" size="medium">
        <form className="modal-form" onSubmit={createEmployee}>
          <div className="form-section-title"><span>Account details</span><small>Only admins can create staff accounts. There is no public signup.</small></div>
          <div className="form-grid two-columns"><label><span>Full name</span><input placeholder="Employee name" required /></label><label><span>Role</span><select><option>Cashier</option><option>Admin</option></select></label><label><span>Email</span><input type="email" placeholder="name@shop.com" required /></label><label><span>Temporary password</span><input type="password" defaultValue="TempPass123!" required /></label></div>
          <div className="pin-setup"><div className="pin-icon"><KeyRound size={19} /></div><div><strong>Quick-login PIN</strong><span>Set a unique 4-digit PIN for the sale terminal.</span></div><input inputMode="numeric" maxLength={4} placeholder="••••" required /></div>
          <label className="toggle-field"><span><strong>Account active immediately</strong><small>The employee can sign in after creation</small></span><input type="checkbox" defaultChecked /><i /></label>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cancel</button><button className="primary-button"><Plus size={16} /> Create account</button></div>
        </form>
      </Modal>

      <Modal open={accessOpen} onClose={() => setAccessOpen(false)} eyebrow="Access control" title="Roles & permissions" size="large">
        <div className="permission-matrix table-responsive">
          <div className="permission-row table-head"><span>Capability</span><span>Admin</span><span>Cashier</span></div>
          {[
            ['Process sales & KHQR', true, true], ['Apply discounts', true, true], ['Refund completed orders', true, false], ['Manage products and price', true, false], ['Record waste', true, true], ['Manage employees', true, false], ['View reports and profit', true, false], ['Edit business settings', true, false],
          ].map(([label, admin, cashier]) => <div className="permission-row" key={String(label)}><strong>{label}</strong><span className={admin ? 'allowed' : ''}>{admin && <Check size={16} />}</span><span className={cashier ? 'allowed' : ''}>{cashier && <Check size={16} />}</span></div>)}
        </div>
        <div className="form-notice"><ShieldCheck size={18} /><span>Permissions are enforced by the API. Hiding a button in the frontend is not considered authorization.</span></div>
        <div className="modal-actions"><button className="primary-button" onClick={() => setAccessOpen(false)}>Done</button></div>
      </Modal>
    </div>
  )
}
