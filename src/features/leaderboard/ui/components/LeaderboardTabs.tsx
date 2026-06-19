import type { AppTab } from '../../types';
import type { LeaderboardViewModel } from '../types';

type LeaderboardTabsProps = {
  board: LeaderboardViewModel;
};

const TABS: Array<{ id: AppTab; label: string }> = [
  { id: 'play', label: 'Play' },
  { id: 'scores', label: 'Scores' },
  { id: 'debug', label: 'Debug' },
];

export function LeaderboardTabs({ board }: LeaderboardTabsProps) {
  return (
    <nav className="tabs" role="tablist" aria-label="Leaderboard sections">
      {TABS.map((tab) => (
        <button
          type="button"
          key={tab.id}
          role="tab"
          aria-selected={board.activeTab === tab.id}
          className={`tab-button ${board.activeTab === tab.id ? 'tab-button-active' : ''}`}
          onClick={() => board.setActiveTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
