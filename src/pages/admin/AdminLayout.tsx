import { NavLink, Navigate, Outlet } from 'react-router-dom'
import {
  BarChart3,
  Clock3,
  LayoutDashboard,
  LogOut,
  Settings,
  ShoppingBag,
  Store,
  Tag,
  Users,
} from 'lucide-react'
import Logo from '../../components/Logo'
import { useStore } from '../../contexts/StoreContext'
import { db } from '../../lib/db'

const nav = [
  { to: '/admin', end: true, label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/admin/products', label: 'Products', Icon: Store },
  { to: '/admin/categories', label: 'Categories', Icon: Tag },
  { to: '/admin/orders', label: 'Orders', Icon: ShoppingBag },
  { to: '/admin/employees', label: 'Employees', Icon: Users },
  { to: '/admin/shifts', label: 'Shifts', Icon: Clock3 },
  { to: '/admin/reports', label: 'Reports', Icon: BarChart3 },
  { to: '/admin/settings', label: 'Settings', Icon: Settings },
]

export default function AdminLayout() {
  const { me } = useStore()
  if (!me) return <Navigate to="/admin/login" replace />
  if (me.role !== 'admin') return <Navigate to="/" replace />

  return (
    <div className="app-shell flex overflow-hidden">
      <aside className="glass m-3 hidden w-[240px] shrink-0 flex-col rounded-[26px] p-4 md:flex">
        <Logo />
        <nav className="mt-6 flex flex-1 flex-col gap-1" aria-label="Admin">
          {nav.map(({ to, end, label, Icon }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={17} /> {label}
            </NavLink>
          ))}
        </nav>
        <button type="button" className="admin-nav-item mt-2" onClick={() => db.logout()}>
          <LogOut size={17} /> Sign out
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="scroll-hide mx-3 mt-3 flex gap-2 overflow-x-auto md:hidden">
          {nav.map(({ to, end, label }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `pill ${isActive ? 'pill-active' : ''}`}>
              {label}
            </NavLink>
          ))}
          <button type="button" className="pill" onClick={() => db.logout()}>
            Sign out
          </button>
        </div>
        <main className="scroll-hide min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
