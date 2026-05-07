import { useMint } from '../hooks/useMint';
import { DebugTabPanel } from './components/DebugTabPanel';
import { MintHeader } from './components/MintHeader';
import { MintTabPanel } from './components/MintTabPanel';
import { MintTabs } from './components/MintTabs';

export default function MintPage() {
  const board = useMint();

  return (
    <main className="page">
      <section className="panel">
        <MintHeader board={board} />
        <MintTabs board={board} />

        <section className="tab-content">
          {board.activeTab === 'mint' && <MintTabPanel board={board} />}
          {board.activeTab === 'debug' && <DebugTabPanel board={board} />}
        </section>

        {board.error && <p className="error">{board.error}</p>}
      </section>
    </main>
  );
}
