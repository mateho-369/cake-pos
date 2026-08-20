import { CakeSlice, ChevronDown, Clock3, LogOut, Search, ShoppingBag, Store } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'

export default function TerminalHeader({
  shiftOpen,
  shiftStartedAt,
  onShift,
  query,
  onQuery,
  cartCount,
  onCart,
}: {
  shiftOpen: boolean
  shiftStartedAt?: string
  onShift: () => void
  query: string
  onQuery: (value: string) => void
  cartCount: number
  onCart: () => void
}) {
  const { employee, signOut } = useAuth()
  const [profileOpen, setProfileOpen] = useState(false)

  return (
    <header className="terminal-header">
      <div className="terminal-brand"><span><CakeSlice size={19} /></span><div><strong>Atelier</strong><small>SALE TERMINAL</small></div></div>
      <label className="terminal-search"><Search size={18} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search cakes or drinks…" /><kbd>⌘K</kbd></label>
      <div className="terminal-header-actions">
        <button className={`shift-status ${shiftOpen ? 'open' : 'closed'}`} onClick={onShift}><span><i /><Clock3 size={15} /></span><div><strong>{shiftOpen ? 'Shift open' : 'Shift closed'}</strong><small>{shiftOpen ? `Started ${shiftStartedAt}` : 'Tap to open'}</small></div></button>
        <button className="mobile-cart-button" onClick={onCart} aria-label="Open cart"><ShoppingBag size={19} />{cartCount > 0 && <span>{cartCount}</span>}</button>
        <div className="cashier-menu">
          <button className="cashier-profile" onClick={() => setProfileOpen(!profileOpen)}><span>SC</span><div><strong>{employee?.name || 'Sophea Chan'}</strong><small>Cashier · BKK1</small></div><ChevronDown size={15} /></button>
          {profileOpen && <div className="profile-popover glass-panel"><div><span>SC</span><strong>{employee?.name || 'Sophea Chan'}</strong><small>Cashier account</small></div><button><Store size={15} /> BKK1 Flagship</button><button onClick={signOut}><LogOut size={15} /> Sign out</button></div>}
        </div>
      </div>
    </header>
  )
}
