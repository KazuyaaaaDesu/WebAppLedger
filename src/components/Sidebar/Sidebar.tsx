import { NavLink } from 'react-router-dom';
import {
  Activity,
  BookOpen,
  CalendarDays,
  ChartLine,
  FileBarChart,
  FlaskConical,
  HandCoins,
  Landmark,
  LayoutDashboard,
  Settings,
  Target,
  Wallet,
  X,
  ArrowLeftRight,
} from 'lucide-react';
import type { ComponentType } from 'react';

import { NAV_ITEMS } from '../../constants';
import { useLedger } from '../../context/LedgerContext';
import avatarUrl from '../../assets/avatar/default.jpg';
import './Sidebar.css';

const ICONS: Record<string, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  LayoutDashboard,
  Landmark,
  BookOpen,
  ArrowLeftRight,
  Wallet,
  Target,
  HandCoins,
  ChartLine,
  Activity,
  FlaskConical,
  FileBarChart,
  CalendarDays,
  Settings,
};

interface SidebarProps {
  onNavigate?: () => void;
  onClose?: () => void;
}

export default function Sidebar({ onNavigate, onClose }: SidebarProps) {
  const { db } = useLedger();

  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark" aria-hidden="true">
          桜
        </span>
        <div>
          <span className="sidebar-brand-name">Sakura Ledger</span>
          <span className="sidebar-brand-tag">personal finance</span>
        </div>
        {onClose && (
          <button type="button" className="icon-btn sidebar-close" onClick={onClose} aria-label="Close navigation">
            <X size={16} />
          </button>
        )}
      </div>

      <div className="sidebar-user">
        <div className="sidebar-user-wrapper">
          <img src={avatarUrl} alt="" width={40} height={40} />
          <div className="sidebar-user-info">
            <span className="sidebar-user-name">{db.profile.name}</span>
            <span className="sidebar-user-email">{db.profile.email}</span>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <ul className="sidebar-list">
          {NAV_ITEMS.map((item) => {
            const Icon = ICONS[item.icon] ?? LayoutDashboard;
            return (
              <li key={item.link} className="sidebar-item">
                <NavLink
                  to={item.link}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={onNavigate}
                >
                  <span className="icon" aria-hidden="true">
                    <Icon size={18} strokeWidth={1.8} />
                  </span>
                  <span className="label">{item.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="sidebar-footer">
        <h4>every small saving counts</h4>
        <p>小さくても、貯まる</p>
      </div>
    </aside>
  );
}
