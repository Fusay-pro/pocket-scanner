import { X, Package } from 'lucide-react';
import type { Product } from '../types';
import { useSettings } from '../contexts/SettingsContext';

interface Props {
  batches: Product[];
  onSelect: (p: Product) => void;
  onClose: () => void;
}

export default function BatchPickerModal({ batches, onSelect, onClose }: Props) {
  const { currencySymbol } = useSettings();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal batch-picker-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header-row">
          <h2>Which one?</h2>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="batch-list">
          {batches.map(batch => (
            <button
              key={batch.id}
              className="batch-item"
              onClick={() => onSelect(batch)}
            >
              {batch.imageUrl ? (
                <img src={batch.imageUrl} className="batch-thumb" alt="" />
              ) : (
                <div className="batch-thumb-placeholder"><Package size={20} /></div>
              )}
              <div className="batch-info">
                <div className="batch-name">{batch.name}</div>
                <div className="batch-qty">{batch.quantity} {batch.unit} in stock</div>
              </div>
              {batch.sellPrice != null && (
                <div className="batch-price">{currencySymbol}{batch.sellPrice.toFixed(2)}</div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
