import { useMint } from '../hooks/useMint';
import { DebugTabPanel } from './components/DebugTabPanel';
import { MintTabPanel } from './components/MintTabPanel';
import { MintTabs } from './components/MintTabs';
import type { OneAmSession } from '../../../oneAm';
import type { WalletStatus } from '../types';

type MintPageProps = {
  oneAmSession: OneAmSession | null;
  walletStatus: WalletStatus;
  statusText: string;
  connectWallet: () => void;
};

export default function MintPage(props: MintPageProps) {
  const board = useMint(props);

  return (
    <section className="dapp-panel" aria-label="Shielded Mint">
      <MintTabs board={board} />

      <section className="tab-content">
        {board.activeTab === 'mint' && <MintTabPanel board={board} />}
        {board.activeTab === 'debug' && <DebugTabPanel board={board} />}
      </section>

      {board.error && <p className="error">{board.error}</p>}
    </section>
  );
}
