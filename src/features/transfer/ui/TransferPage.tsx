import { useTransfer } from '../hooks/useTransfer';
import { DebugTabPanel } from './components/DebugTabPanel';
import { TransferHeader } from './components/TransferHeader';
import { TransferTabPanel } from './components/TransferTabPanel';
import { TransferTabs } from './components/TransferTabs';

export default function TransferPage() {
  const board = useTransfer();

  return (
    <main className="page">
      <section className="panel">
        <TransferHeader board={board} />
        <TransferTabs board={board} />

        <section className="tab-content">
          {board.activeTab === 'transfer' && <TransferTabPanel board={board} />}
          {board.activeTab === 'debug' && <DebugTabPanel board={board} />}
        </section>

        {board.error && <p className="error">{board.error}</p>}
      </section>
    </main>
  );
}
