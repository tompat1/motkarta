import React, { useEffect } from "react";
import { CheckCircle, Info, Sparkle, WarningCircle, X } from "@phosphor-icons/react";

export interface AdminToast {
  id: string;
  type: "success" | "info" | "warning" | "ml_event";
  title: string;
  message: string;
  detail?: string;
  timestamp: string;
}

interface AdminToastContainerProps {
  toasts: AdminToast[];
  onDismiss: (id: string) => void;
}

export function AdminToastContainer({ toasts, onDismiss }: AdminToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="admin-toast-container" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <AdminToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}

function AdminToastItem({ toast, onDismiss }: { toast: AdminToast; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss();
    }, 6500);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const renderIcon = () => {
    switch (toast.type) {
      case "ml_event":
        return <Sparkle size={18} weight="bold" className="toast-icon ml-event" />;
      case "success":
        return <CheckCircle size={18} weight="bold" className="toast-icon success" />;
      case "warning":
        return <WarningCircle size={18} weight="bold" className="toast-icon warning" />;
      case "info":
      default:
        return <Info size={18} weight="bold" className="toast-icon info" />;
    }
  };

  return (
    <div className={`admin-toast-item type-${toast.type}`}>
      <div className="admin-toast-content">
        <div className="admin-toast-head">
          {renderIcon()}
          <span className="admin-toast-title">{toast.title}</span>
          <span className="admin-toast-time">{toast.timestamp}</span>
          <button
            type="button"
            className="admin-toast-close"
            onClick={onDismiss}
            aria-label="Avfärda notis"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
        <p className="admin-toast-message">{toast.message}</p>
        {toast.detail ? (
          <div className="admin-toast-detail">
            <span className="detail-tag">ML-transparens:</span>
            <span>{toast.detail}</span>
          </div>
        ) : null}
      </div>
      <div className="admin-toast-progress-bar" />
    </div>
  );
}
