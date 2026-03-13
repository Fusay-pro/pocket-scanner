import { X, CheckCircle, AlertTriangle, Clock, Package } from 'lucide-react';
import type { Product } from '../types';
import { getExpiryStatus, formatDate } from '../types';

interface Props {
  batches: Product[];
  onSelect: (p: Product) => void;
  onClose: () => void;
}

export default function BatchPickerModal({ batches, onSelect, onClose }: Props) {
  const sorted = [...batches].sort((a, b) => {
    if (!a.expiryDate && !b.expiryDate) return 0;
    if (!a.expiryDate) return 1;
    if (!b.expiryDate) return -1;
    return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
  });

  const fefoId = sorted[0]?.id;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal batch-picker-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header-row">
          <h2>Select Batch</h2>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <p className="batch-picker-subtitle">
          {batches[0]?.name} — {sorted.length} batches available
        </p>
        <div className="batch-list">
          {sorted.map(batch => {
            const status = getExpiryStatus(batch.expiryDate);
            const Icon = status === 'expired' ? AlertTriangle
              : status === 'soon' ? Clock
              : status === 'ok' ? CheckCircle
              : Package;
            return (
              <button
                key={batch.id}
                className={`batch-item batch-item-${status}`}
                onClick={() => onSelect(batch)}
              >
                <div className={`batch-status-icon status-${status}`}>
                  <Icon size={18} />
                </div>
                <div className="batch-info">
                  <div className="batch-expiry">
                    {batch.expiryDate ? formatDate(batch.expiryDate) : 'No expiry date'}
                    {batch.id === fefoId && (
                      <span className="batch-recommended">Recommended</span>
                    )}
                  </div>
                  <div className="batch-qty">
                    {batch.quantity} {batch.unit} in stock
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
