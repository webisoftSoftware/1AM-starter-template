import type { MintViewModel } from '../types';

type MintTabsProps = {
  board: MintViewModel;
};

const TABS: Array<{ id: 'mint' | 'debug'; label: string }> = [
  { id: 'mint', label: 'Mint' },
  { id: 'debug', label: 'Debug' },
];

export function MintTabs({ board }: MintTabsProps) {
  return (
    <nav className="tabs" role="tablist" aria-label="Mint sections">
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
