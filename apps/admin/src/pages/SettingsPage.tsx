import { useEffect, useState } from 'react'
import { uploadImage } from '@cake-pos/uploads'
import {
  Building2,
  ChevronRight,
  Clipboard,
  CreditCard,
  Database,
  KeyRound,
  LockKeyhole,
  ReceiptText,
  Save,
  ShieldCheck,
  Store,
  TimerReset,
} from 'lucide-react'
import { apiRequest, getApiUrl } from '../lib/api'
import { useTranslation } from '../lib/i18n'

const settingsTabs = [
  { id: 'business', label: 'settings.businessProfile', icon: Building2 },
  { id: 'payments', label: 'settings.paymentsKhqr', icon: CreditCard },
  { id: 'receipts', label: 'settings.receipts', icon: ReceiptText },
  { id: 'freshness', label: 'settings.freshnessRules', icon: TimerReset },
  { id: 'security', label: 'settings.securityApi', icon: ShieldCheck },
]
type ReceiptConfig = {
  paperSize: '58mm' | '80mm' | 'A4'
  language: 'en' | 'km'
  businessName: string
  address: string
  logoUrl: string
  footerMessage: string
}
const defaultReceipt: ReceiptConfig = {
  paperSize: '80mm',
  language: 'en',
  businessName: 'Atelier Cake Shop',
  address: 'Street 63, BKK1, Phnom Penh',
  logoUrl: '',
  footerMessage: 'Thank you for your order!',
}
export default function SettingsPage({
  onToast,
}: {
  onToast: (message: string) => void
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState('business')
  const [receipt, setReceipt] = useState<ReceiptConfig>(defaultReceipt)
  const [maxCashierDiscountPercent, setMaxCashierDiscountPercent] = useState(10)
  const [khqrImageUrl, setKhqrImageUrl] = useState('')
  useEffect(() => {
    void Promise.all([
      apiRequest<ReceiptConfig>('/api/settings/receipt-template').then(
        setReceipt,
      ),
      apiRequest<{
        maxCashierDiscountPercent: number
        khqrImageUrl?: string
      }>('/api/settings/pos-rules').then((value) => {
        setMaxCashierDiscountPercent(value.maxCashierDiscountPercent)
        setKhqrImageUrl(value.khqrImageUrl || '')
      }),
    ]).catch(() => undefined)
  }, [])
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      if (tab === 'receipts')
        setReceipt(
          await apiRequest<ReceiptConfig>('/api/settings/receipt-template', {
            method: 'PUT',
            body: JSON.stringify(receipt),
          }),
        )
      if (tab === 'payments') {
        const result = await apiRequest<{
          maxCashierDiscountPercent: number
          khqrImageUrl?: string
        }>('/api/settings/pos-rules', {
          method: 'PUT',
          body: JSON.stringify({ maxCashierDiscountPercent, khqrImageUrl }),
        })
        setMaxCashierDiscountPercent(result.maxCashierDiscountPercent)
        setKhqrImageUrl(result.khqrImageUrl || '')
      }
      onToast(t('settings.settingsSaved'))
    } catch (reason) {
      onToast(
        reason instanceof Error ? reason.message : 'Could not save settings',
      )
    }
  }
  return (
    <div className="page-content settings-layout">
      <aside className="glass-panel settings-nav">
        <span>{t('settings.configuration')}</span>
        {settingsTabs.map((item) => {
          const Icon = item.icon
          return (
            <button
              type="button"
              key={item.id}
              className={tab === item.id ? 'active' : ''}
              onClick={() => setTab(item.id)}
            >
              <Icon size={18} />
              <span>{t(item.label)}</span>
              <ChevronRight size={15} />
            </button>
          )
        })}
      </aside>
      <form className="glass-panel settings-content" onSubmit={save}>
        {tab === 'business' && <BusinessSettings />}
        {tab === 'payments' && (
          <PaymentSettings
            maxDiscount={maxCashierDiscountPercent}
            onMaxDiscount={setMaxCashierDiscountPercent}
            khqrImageUrl={khqrImageUrl}
            onKhqrImageUrl={setKhqrImageUrl}
            onUploadError={onToast}
          />
        )}
        {tab === 'receipts' && (
          <ReceiptSettings value={receipt} onChange={setReceipt} />
        )}
        {tab === 'freshness' && <FreshnessSettings />}
        {tab === 'security' && <SecuritySettings onToast={onToast} />}
        <div className="settings-save-bar">
          <span>{t('settings.applyBoth')}</span>
          <button className="primary-button">
            <Save size={16} /> {t('common.save')}
          </button>
        </div>
      </form>
    </div>
  )
}
function SettingHeader({
  icon,
  eyebrow,
  title,
  description,
}: {
  icon: React.ReactNode
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className="setting-header">
      <div>{icon}</div>
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  )
}
function BusinessSettings() {
  const { t } = useTranslation()
  return (
    <>
      <SettingHeader
        icon={<Store size={21} />}
        eyebrow={t('settings.business')}
        title={t('settings.businessProfile')}
        description={t('settings.businessDescription')}
      />
      <div className="setting-section">
        <h3>{t('settings.shopDetails')}</h3>
        <div className="form-grid two-columns">
          <label>
            <span>{t('settings.businessName')}</span>
            <input defaultValue="Atelier Cake Shop" />
          </label>
          <label>
            <span>{t('settings.locationName')}</span>
            <input defaultValue="BKK1 Flagship" />
          </label>
          <label className="span-two">
            <span>{t('settings.address')}</span>
            <input defaultValue="Street 63, BKK1, Phnom Penh" />
          </label>
          <label>
            <span>{t('settings.phone')}</span>
            <input defaultValue="+855 12 345 678" />
          </label>
          <label>
            <span>{t('settings.timezone')}</span>
            <select defaultValue="Asia/Phnom_Penh">
              <option>Asia/Phnom_Penh</option>
            </select>
          </label>
        </div>
      </div>
      <div className="setting-section">
        <h3>{t('settings.regional')}</h3>
        <div className="form-grid two-columns">
          <label>
            <span>{t('settings.currency')}</span>
            <select>
              <option>{t('settings.usd')}</option>
              <option>{t('settings.khr')}</option>
            </select>
          </label>
          <label>
            <span>{t('settings.secondary')}</span>
            <select>
              <option>{t('settings.conversion')}</option>
              <option>{t('settings.none')}</option>
            </select>
          </label>
        </div>
      </div>
    </>
  )
}
function PaymentSettings({
  maxDiscount,
  onMaxDiscount,
  khqrImageUrl,
  onKhqrImageUrl,
  onUploadError,
}: {
  maxDiscount: number
  onMaxDiscount: (value: number) => void
  khqrImageUrl: string
  onKhqrImageUrl: (value: string) => void
  onUploadError: (message: string) => void
}) {
  const { t } = useTranslation()
  const [uploadingKhqr, setUploadingKhqr] = useState(false)
  const uploadKhqr = async (file?: File) => {
    if (!file) return
    setUploadingKhqr(true)
    try {
      const uploaded = await uploadImage(file, apiRequest)
      onKhqrImageUrl(uploaded.publicUrl)
    } catch (reason) {
      onUploadError(
        reason instanceof Error ? reason.message : 'KHQR upload failed',
      )
    } finally {
      setUploadingKhqr(false)
    }
  }
  return (
    <>
      <SettingHeader
        icon={<CreditCard size={21} />}
        eyebrow={t('settings.payments')}
        title={t('settings.paymentsKhqr')}
        description={t('settings.paymentsDescription')}
      />
      <div className="setting-section">
        <h3>{t('settings.accepted')}</h3>
        <label className="setting-toggle-row">
          <span>
            <CreditCard size={18} />
            <b>{t('dashboard.cash')}</b>
            <small>{t('settings.trackDrawer')}</small>
          </span>
          <input type="checkbox" defaultChecked />
          <i />
        </label>
        <label className="setting-toggle-row">
          <span>
            <span className="khqr-mark">KH</span>
            <b>{t('settings.khqrQrPay')}</b>
            <small>{t('settings.showMerchant')}</small>
          </span>
          <input type="checkbox" defaultChecked />
          <i />
        </label>
      </div>
      <div className="setting-section">
        <h3>{t('settings.merchantDetails')}</h3>
        <div className="form-grid two-columns">
          <label>
            <span>{t('settings.merchantName')}</span>
            <input defaultValue="ATELIER CAKE SHOP" />
          </label>
          <label>
            <span>{t('settings.bakong')}</span>
            <input defaultValue="atelier@bakong" />
          </label>
          <label className="span-two">
            <span>{t('settings.staticQr')}</span>
            <div className="upload-inline">
              {khqrImageUrl ? (
                <img
                  className="qr-placeholder"
                  src={khqrImageUrl}
                  alt="Current KHQR code"
                />
              ) : (
                <div className="qr-placeholder">QR</div>
              )}
              <span>
                <strong>
                  {khqrImageUrl
                    ? 'KHQR image stored'
                    : 'No KHQR image uploaded'}
                </strong>
                <small>JPEG, PNG, or WebP · max 10 MB</small>
              </span>
              <span className="secondary-button upload-button-label">
                {uploadingKhqr ? 'Uploading…' : t('settings.replace')}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploadingKhqr}
                  onChange={(event) => {
                    void uploadKhqr(event.target.files?.[0])
                    event.target.value = ''
                  }}
                />
              </span>
            </div>
          </label>
        </div>
      </div>
      <div className="setting-section">
        <h3>Discount approval</h3>
        <label>
          <span>Maximum cashier discount percent</span>
          <div className="suffix-input">
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={maxDiscount}
              onChange={(event) => onMaxDiscount(Number(event.target.value))}
            />
            <span>%</span>
          </div>
          <small>
            Cashiers need an administrator for any percentage or fixed discount
            whose effective rate exceeds this limit.
          </small>
        </label>
      </div>
      <div className="form-notice">
        <ShieldCheck size={18} />
        <span>{t('settings.mvpNotice')}</span>
      </div>
    </>
  )
}
function ReceiptSettings({
  value,
  onChange,
}: {
  value: ReceiptConfig
  onChange: (value: ReceiptConfig) => void
}) {
  const { t } = useTranslation()
  const set = <K extends keyof ReceiptConfig>(key: K, next: ReceiptConfig[K]) =>
    onChange({ ...value, [key]: next })
  return (
    <>
      <SettingHeader
        icon={<ReceiptText size={21} />}
        eyebrow={t('settings.receiptsEyebrow')}
        title={t('settings.receipts')}
        description="Configure a reusable template for thermal and office printers."
      />
      <div className="receipt-settings-grid">
        <div>
          <div className="setting-section">
            <h3>Printer & language</h3>
            <div className="form-grid two-columns">
              <label>
                <span>Paper size</span>
                <select
                  value={value.paperSize}
                  onChange={(event) =>
                    set(
                      'paperSize',
                      event.target.value as ReceiptConfig['paperSize'],
                    )
                  }
                >
                  <option value="58mm">58mm thermal</option>
                  <option value="80mm">80mm thermal</option>
                  <option value="A4">A4</option>
                </select>
              </label>
              <label>
                <span>Receipt language</span>
                <select
                  value={value.language}
                  onChange={(event) =>
                    set('language', event.target.value as 'en' | 'km')
                  }
                >
                  <option value="en">English</option>
                  <option value="km">ខ្មែរ</option>
                </select>
              </label>
            </div>
          </div>
          <div className="setting-section">
            <h3>Business identity</h3>
            <div className="form-grid two-columns">
              <label>
                <span>Business name</span>
                <input
                  value={value.businessName}
                  onChange={(event) => set('businessName', event.target.value)}
                  required
                />
              </label>
              <label>
                <span>Logo URL</span>
                <input
                  value={value.logoUrl}
                  onChange={(event) => set('logoUrl', event.target.value)}
                  placeholder="https://…"
                />
              </label>
              <label className="span-two">
                <span>Address</span>
                <textarea
                  rows={3}
                  value={value.address}
                  onChange={(event) => set('address', event.target.value)}
                />
              </label>
              <label className="span-two">
                <span>Footer message</span>
                <textarea
                  rows={3}
                  value={value.footerMessage}
                  onChange={(event) => set('footerMessage', event.target.value)}
                />
              </label>
            </div>
          </div>
        </div>
        <ReceiptPreview value={value} />
      </div>
    </>
  )
}
function ReceiptPreview({ value }: { value: ReceiptConfig }) {
  const km = value.language === 'km'
  return (
    <aside className={`receipt-live-preview paper-${value.paperSize}`}>
      <span>LIVE PREVIEW · {value.paperSize}</span>
      <div>
        {value.logoUrl && <img src={value.logoUrl} alt="" />}
        <h3>{value.businessName || 'Business name'}</h3>
        <p>{value.address}</p>
        <h4>{km ? 'បង្កាន់ដៃ' : 'RECEIPT'}</h4>
        <section>
          <span>{km ? 'ការបញ្ជាទិញ' : 'Order'}</span>
          <b>CS-1052</b>
          <span>Strawberry Cloud × 1</span>
          <b>$28.00</b>
          <span>Americano × 2</span>
          <b>$5.00</b>
        </section>
        <strong>
          <span>{km ? 'សរុប' : 'TOTAL'}</span>
          <b>$33.00</b>
        </strong>
        <footer>{value.footerMessage}</footer>
      </div>
    </aside>
  )
}
function FreshnessSettings() {
  const { t } = useTranslation()
  const fields = [
    ['highlightNear', true],
    ['sortExpiry', true],
    ['blockExpired', true],
    ['allowWaste', true],
  ] as const
  return (
    <>
      <SettingHeader
        icon={<TimerReset size={21} />}
        eyebrow={t('settings.inventory')}
        title={t('settings.freshnessRules')}
        description={t('settings.freshnessDescription')}
      />
      <div className="setting-section">
        <h3>{t('settings.defaultLifecycle')}</h3>
        <div className="form-grid two-columns">
          <label>
            <span>{t('settings.shelfLife')}</span>
            <div className="suffix-input">
              <input type="number" defaultValue="3" min="1" />
              <span>{t('common.days')}</span>
            </div>
          </label>
          <label>
            <span>{t('settings.warningBegins')}</span>
            <div className="suffix-input">
              <input type="number" defaultValue="1" min="0" />
              <span>{t('settings.dayBefore')}</span>
            </div>
          </label>
        </div>
      </div>
      <div className="setting-section">
        <h3>{t('settings.terminalBehavior')}</h3>
        {fields.map(([key, checked]) => (
          <label className="setting-toggle-row compact" key={key}>
            <span>
              <b>{t(`settings.${key}`)}</b>
            </span>
            <input type="checkbox" defaultChecked={checked} />
            <i />
          </label>
        ))}
      </div>
      <div className="form-notice warning">
        <TimerReset size={18} />
        <span>{t('settings.overrideNotice')}</span>
      </div>
    </>
  )
}
function SecuritySettings({ onToast }: { onToast: (message: string) => void }) {
  const { t } = useTranslation()
  const apiUrl = getApiUrl()
  const copy = (value: string) => {
    navigator.clipboard?.writeText(value)
    onToast(t('settings.copied'))
  }
  return (
    <>
      <SettingHeader
        icon={<ShieldCheck size={21} />}
        eyebrow={t('settings.security')}
        title={t('settings.securityApi')}
        description={t('settings.securityDescription')}
      />
      <div className="setting-section">
        <h3>{t('settings.authPolicy')}</h3>
        <div className="security-method">
          <div>
            <KeyRound size={19} />
          </div>
          <span>
            <strong>{t('settings.bearer')}</strong>
            <small>{t('settings.bearerDetail')}</small>
          </span>
          <span className="status-badge success">
            <i />
            {t('settings.enforced')}
          </span>
        </div>
        <div className="security-method">
          <div>
            <LockKeyhole size={19} />
          </div>
          <span>
            <strong>{t('settings.adminAccounts')}</strong>
            <small>{t('settings.adminAccountsDetail')}</small>
          </span>
          <span className="status-badge success">
            <i />
            {t('settings.enforced')}
          </span>
        </div>
      </div>
      <div className="setting-section">
        <h3>{t('settings.connectedOrigins')}</h3>
        <div className="endpoint-list">
          <div>
            <span>{t('settings.sharedApi')}</span>
            <code>{apiUrl}</code>
            <button
              type="button"
              onClick={() => copy(apiUrl)}
              aria-label={t('common.copy')}
            >
              <Clipboard size={15} />
            </button>
          </div>
          <div>
            <span>{t('settings.saleTerminal')}</span>
            <code>https://sale.yourdomain.com</code>
            <button
              type="button"
              onClick={() => copy('https://sale.yourdomain.com')}
              aria-label={t('common.copy')}
            >
              <Clipboard size={15} />
            </button>
          </div>
          <div>
            <span>{t('settings.adminControl')}</span>
            <code>https://admin.yourdomain.com</code>
            <button
              type="button"
              onClick={() => copy('https://admin.yourdomain.com')}
              aria-label={t('common.copy')}
            >
              <Clipboard size={15} />
            </button>
          </div>
        </div>
      </div>
      <div className="cors-status">
        <Database size={20} />
        <div>
          <strong>{t('settings.corsChecklist')}</strong>
          <span>{t('settings.corsDetail')}</span>
        </div>
        <span className="status-badge info">
          <i />
          {t('settings.configured')}
        </span>
      </div>
    </>
  )
}
