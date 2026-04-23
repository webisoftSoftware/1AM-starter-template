import { useTaskBoard } from '../hooks/useTaskBoard';
import { AddTabPanel } from './components/AddTabPanel';
import { DebugTabPanel } from './components/DebugTabPanel';
import { ListTabPanel } from './components/ListTabPanel';
import { TaskBoardHeader } from './components/TaskBoardHeader';
import { TaskBoardTabs } from './components/TaskBoardTabs';

export default function TaskBoardPage() {
  const board = useTaskBoard();

  return (
    <main className="page">
      <section className="panel">
        <TaskBoardHeader board={board} />
        <TaskBoardTabs board={board} />

        <section className="tab-content">
          {board.activeTab === 'add' && <AddTabPanel board={board} />}
          {board.activeTab === 'list' && <ListTabPanel board={board} />}
          {board.activeTab === 'debug' && <DebugTabPanel board={board} />}
        </section>

        {board.error && <p className="error">{board.error}</p>}
      </section>
    </main>
  );
}
