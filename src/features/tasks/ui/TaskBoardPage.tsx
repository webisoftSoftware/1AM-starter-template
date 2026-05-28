import { useTaskBoard } from '../hooks/useTaskBoard';
import { AddTabPanel } from './components/AddTabPanel';
import { DebugTabPanel } from './components/DebugTabPanel';
import { ListTabPanel } from './components/ListTabPanel';
import { TaskBoardTabs } from './components/TaskBoardTabs';
import type { OneAmSession } from '../../../oneAm';
import type { WalletStatus } from '../types';

type TaskBoardPageProps = {
  oneAmSession: OneAmSession | null;
  walletStatus: WalletStatus;
  statusText: string;
  connectWallet: () => void;
};

export default function TaskBoardPage(props: TaskBoardPageProps) {
  const board = useTaskBoard(props);

  return (
    <section className="dapp-panel" aria-label="Task Board">
      <TaskBoardTabs board={board} />

      <section className="tab-content">
        {board.activeTab === 'add' && <AddTabPanel board={board} />}
        {board.activeTab === 'list' && <ListTabPanel board={board} />}
        {board.activeTab === 'debug' && <DebugTabPanel board={board} />}
      </section>

      {board.error && <p className="error">{board.error}</p>}
    </section>
  );
}
