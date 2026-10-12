import { NavLink, Outlet } from 'react-router-dom';
import './SectionHub.css';

export interface SectionTab {
  label: string;
  to: string;
  description: string;
}

interface SectionHubProps {
  title: string;
  description: string;
  tabs: SectionTab[];
}

/** Shared, compact tab shell for related tools. Existing page components remain
 * responsible for their own content and business logic. */
export default function SectionHub({ title, description, tabs }: SectionHubProps) {
  return (
    <div className="section-hub">
      <header className="section-hub-heading">
        <div>
          <p className="section-hub-eyebrow">WORKSPACE</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      <nav className="section-tabs" aria-label={`${title} tools`}>
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} className={({ isActive }) => `section-tab${isActive ? ' is-active' : ''}`}>
            <span>{tab.label}</span>
            <small>{tab.description}</small>
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
