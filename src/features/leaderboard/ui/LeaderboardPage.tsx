import { useLeaderboard } from '../hooks/useLeaderboard';
import { DebugTabPanel } from './components/DebugTabPanel';
import { LeaderboardTabs } from './components/LeaderboardTabs';
import { PlayTabPanel } from './components/PlayTabPanel';
import { ScoresTabPanel } from './components/ScoresTabPanel';
import type { OneAmSession } from '../../../oneAm';
import type { WalletStatus } from '../types';

type LeaderboardPageProps = {
  oneAmSession: OneAmSession | null;
  walletStatus: WalletStatus;
  statusText: string;
  connectWallet: () => void;
};

export default function LeaderboardPage(props: LeaderboardPageProps) {
  const board = useLeaderboard(props);

  return (
    <section className="dapp-panel" aria-label="Leaderboard">
      <LeaderboardTabs board={board} />

      <section className="tab-content">
        {board.activeTab === 'play' && <PlayTabPanel board={board} />}
        {board.activeTab === 'scores' && <ScoresTabPanel board={board} />}
        {board.activeTab === 'debug' && <DebugTabPanel board={board} />}
      </section>

      {board.error && <p className="error">{board.error}</p>}
    </section>
  );
}
