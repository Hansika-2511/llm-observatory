import React from "react";
import { Outlet, NavLink } from "react-router-dom";
import { MessageSquare, BarChart2, FileText, Activity } from "lucide-react";

export default function App() {
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Sidebar */}
      <nav style={{
        width: 56,
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "16px 0",
        gap: 4,
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{
          width: 32, height: 32,
          background: "var(--accent)",
          borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 16,
        }}>
          <Activity size={16} color="#000" />
        </div>

        <NavItem to="/chat" icon={<MessageSquare size={18} />} label="Chat" />
        <NavItem to="/dashboard" icon={<BarChart2 size={18} />} label="Dashboard" />
        <NavItem to="/logs" icon={<FileText size={18} />} label="Logs" />
      </nav>

      {/* Main content */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        <Outlet />
      </div>
    </div>
  );
}

function NavItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      title={label}
      style={({ isActive }) => ({
        width: 40, height: 40,
        display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: 8,
        color: isActive ? "var(--accent)" : "var(--text3)",
        background: isActive ? "rgba(110,231,183,0.08)" : "transparent",
        transition: "all 0.15s",
      })}
    >
      {icon}
    </NavLink>
  );
}
