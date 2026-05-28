import type { AppTab } from '../../types';
import type { TransferViewModel } from '../types';

type TransferTabsProps = {
  board: TransferViewModel;
};

const TABS: Array<{ id: AppTab; label: string }> = [
  { id: 'transfer', label: 'Transfer' },
  { id: 'debug', label: 'Debug' },
];

export function TransferTabs({ board }: TransferTabsProps) {
  return (
    <nav className="tabs" role="tablist" aria-label="Transfer sections">
      {TABS.map((tab) => (
        <button
          type="button"
          key={tab.id}
          role="tab"
          aria-selected={board.activeTab === tab.id}
          className={`tab ${board.activeTab === tab.id ? 'tab-active' : ''}`}
          onClick={() => board.setActiveTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
