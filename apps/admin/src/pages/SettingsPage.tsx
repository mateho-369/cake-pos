import { useState } from 'react'
import { Building2, Check, ChevronRight, Clipboard, CreditCard, Database, KeyRound, LockKeyhole, ReceiptText, Save, ShieldCheck, Store, TimerReset } from 'lucide-react'
import { getApiUrl } from '../lib/api'

const settingsTabs = [
  { id: 'business', label: 'Business profile', icon: Building2 },
  { id: 'payments', label: 'Payments & KHQR', icon: CreditCard },
  { id: 'receipts', label: 'Receipts', icon: ReceiptText },
  { id: 'freshness', label: 'Freshness rules', icon: TimerReset },
  { id: 'security', label: 'Security & API', icon: ShieldCheck },
]

export default function SettingsPage({ onToast }: { onToast: (message: string) => void }) {
  const [tab, setTab] = useState('business')

  const save = (event: React.FormEvent) => {
    event.preventDefault()
    onToast('Settings saved')
  }

  return (
    <div className="page-content settings-layout">
      <aside className="glass-panel settings-nav">
        <span>Configuration</span>
        {settingsTabs.map((item) => { const Icon = item.icon; return <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}><Icon size={18} /><span>{item.label}</span><ChevronRight size={15} /></button> })}
      </aside>

      <form className="glass-panel settings-content" onSubmit={save}>
        {tab === 'business' && <BusinessSettings />}
        {tab === 'payments' && <PaymentSettings />}
        {tab === 'receipts' && <ReceiptSettings />}
        {tab === 'freshness' && <FreshnessSettings />}
        {tab === 'security' && <SecuritySettings onToast={onToast} />}
        <div className="settings-save-bar"><span>Changes apply to both sale and admin applications.</span><button className="primary-button"><Save size={16} /> Save changes</button></div>
      </form>
    </div>
  )
}

function SettingHeader({ icon, eyebrow, title, description }: { icon: React.ReactNode; eyebrow: string; title: string; description: string }) {
  return <div className="setting-header"><div>{icon}</div><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>
}

function BusinessSettings() {
  return <><SettingHeader icon={<Store size={21} />} eyebrow="BUSINESS" title="Business profile" description="Core details used across terminals, receipts and reports." /><div className="setting-section"><h3>Shop details</h3><div className="form-grid two-columns"><label><span>Business name</span><input defaultValue="Atelier Cake Shop" /></label><label><span>Location name</span><input defaultValue="BKK1 Flagship" /></label><label className="span-two"><span>Address</span><input defaultValue="Street 63, BKK1, Phnom Penh" /></label><label><span>Phone</span><input defaultValue="+855 12 345 678" /></label><label><span>Timezone</span><select defaultValue="Asia/Phnom_Penh"><option>Asia/Phnom_Penh</option></select></label></div></div><div className="setting-section"><h3>Regional format</h3><div className="form-grid two-columns"><label><span>Primary currency</span><select><option>USD — US Dollar</option><option>KHR — Cambodian Riel</option></select></label><label><span>Secondary display</span><select><option>KHR conversion</option><option>None</option></select></label></div></div></>
}

function PaymentSettings() {
  return <><SettingHeader icon={<CreditCard size={21} />} eyebrow="PAYMENTS" title="Payments & KHQR" description="Control payment methods and the manual KHQR confirmation workflow." /><div className="setting-section"><h3>Accepted methods</h3><label className="setting-toggle-row"><span><CreditCard size={18} /><b>Cash</b><small>Track drawer balance and shift variance</small></span><input type="checkbox" defaultChecked /><i /></label><label className="setting-toggle-row"><span><span className="khqr-mark">KH</span><b>KHQR / QR Pay</b><small>Show merchant QR and require cashier confirmation</small></span><input type="checkbox" defaultChecked /><i /></label></div><div className="setting-section"><h3>KHQR merchant details</h3><div className="form-grid two-columns"><label><span>Merchant name</span><input defaultValue="ATELIER CAKE SHOP" /></label><label><span>Bakong account</span><input defaultValue="atelier@bakong" /></label><label className="span-two"><span>Static QR image</span><div className="upload-inline"><div className="qr-placeholder">QR</div><span><strong>atelier-khqr.png</strong><small>PNG · 42 KB</small></span><button type="button" className="secondary-button">Replace</button></div></label></div></div><div className="form-notice"><ShieldCheck size={18} /><span>MVP mode uses a static QR and manual cashier confirmation. No real-time Bakong API is connected.</span></div></>
}

function ReceiptSettings() {
  return <><SettingHeader icon={<ReceiptText size={21} />} eyebrow="RECEIPTS" title="Receipt preferences" description="Configure customer receipts and operational details." /><div className="setting-section"><h3>Receipt content</h3>{[['Show business address', true], ['Show cashier name', true], ['Show product freshness date', false], ['Show KHQR reference', true]].map(([label, checked]) => <label className="setting-toggle-row compact" key={String(label)}><span><b>{label}</b></span><input type="checkbox" defaultChecked={Boolean(checked)} /><i /></label>)}</div><div className="setting-section"><h3>Footer message</h3><label><span>Customer note</span><textarea rows={4} defaultValue="Thank you for supporting fresh, local baking. Enjoy today for the best experience." /></label></div></>
}

function FreshnessSettings() {
  return <><SettingHeader icon={<TimerReset size={21} />} eyebrow="INVENTORY" title="Freshness rules" description="Define the default shelf-life and FEFO sale-terminal behavior." /><div className="setting-section"><h3>Default lifecycle</h3><div className="form-grid two-columns"><label><span>Default shelf life</span><div className="suffix-input"><input type="number" defaultValue="3" min="1" /><span>days</span></div></label><label><span>Warning begins</span><div className="suffix-input"><input type="number" defaultValue="1" min="0" /><span>day before</span></div></label></div></div><div className="setting-section"><h3>Sale terminal behavior</h3>{[['Highlight products near best-before', true], ['Sort near-expiry products first', true], ['Block expired products from sale', true], ['Allow cashier to record waste', true]].map(([label, checked]) => <label className="setting-toggle-row compact" key={String(label)}><span><b>{label}</b></span><input type="checkbox" defaultChecked={Boolean(checked)} /><i /></label>)}</div><div className="form-notice warning"><TimerReset size={18} /><span>Product-level dates can override these defaults. Expired products are always retained in reports and audit history.</span></div></>
}

function SecuritySettings({ onToast }: { onToast: (message: string) => void }) {
  const apiUrl = getApiUrl()
  const copy = (value: string) => { navigator.clipboard?.writeText(value); onToast('Copied to clipboard') }
  return <><SettingHeader icon={<ShieldCheck size={21} />} eyebrow="SECURITY" title="Security & API" description="Review access policy and the separate-origin API connection." /><div className="setting-section"><h3>Authentication policy</h3><div className="security-method"><div><KeyRound size={19} /></div><span><strong>Bearer token authentication</strong><small>Tokens are returned at login, kept in React memory and sent in the Authorization header. Session cookies are not used.</small></span><span className="status-badge success"><i />Enforced</span></div><div className="security-method"><div><LockKeyhole size={19} /></div><span><strong>Admin-controlled accounts</strong><small>Public registration is disabled. New employees are created by an admin only.</small></span><span className="status-badge success"><i />Enforced</span></div></div><div className="setting-section"><h3>Connected origins</h3><div className="endpoint-list"><div><span>Shared API</span><code>{apiUrl}</code><button type="button" onClick={() => copy(apiUrl)}><Clipboard size={15} /></button></div><div><span>Sale terminal</span><code>https://sale.yourdomain.com</code><button type="button" onClick={() => copy('https://sale.yourdomain.com')}><Clipboard size={15} /></button></div><div><span>Admin control</span><code>https://admin.yourdomain.com</code><button type="button" onClick={() => copy('https://admin.yourdomain.com')}><Clipboard size={15} /></button></div></div></div><div className="cors-status"><Database size={20} /><div><strong>Cross-origin API checklist</strong><span>Specific origins only · Authorization allowed · OPTIONS preflight enabled · Credentials disabled</span></div><span className="status-badge info"><i />Configured</span></div></>
}
