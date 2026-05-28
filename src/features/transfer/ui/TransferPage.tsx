import { useTransfer } from '../hooks/useTransfer';
import { DebugTabPanel } from './components/DebugTabPanel';
import { TransferTabPanel } from './components/TransferTabPanel';
import { TransferTabs } from './components/TransferTabs';
import type { OneAmSession } from '../../../oneAm';
import type { WalletStatus } from '../types';

type TransferPageProps = {
  oneAmSession: OneAmSession | null;
  walletStatus: WalletStatus;
  statusText: string;
  connectWallet: () => void;
};

export default function TransferPage({ oneAmSession, walletStatus, statusText, connectWallet }: TransferPageProps) {
  const board = useTransfer({
    session: oneAmSession,
    walletStatus,
    statusText,
    connectWallet,
  });

  return (
    <section className="dapp-panel" aria-label="NIGHT Transfer">
      <TransferTabs board={board} />

      <section className="tab-content">
        {board.activeTab === 'transfer' && <TransferTabPanel board={board} />}
        {board.activeTab === 'debug' && <DebugTabPanel board={board} />}
      </section>

      {board.error && <p className="error">{board.error}</p>}
    </section>
  );
}
