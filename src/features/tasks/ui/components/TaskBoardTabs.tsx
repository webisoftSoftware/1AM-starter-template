import type { TaskBoardViewModel } from '../types';

type TaskBoardTabsProps = {
  board: TaskBoardViewModel;
};

export function TaskBoardTabs({ board }: TaskBoardTabsProps) {
  return (
    <div className="tabs" role="tablist" aria-label="Task board sections">
      <button
        type="button"
        role="tab"
        className={`tab-button ${board.activeTab === 'add' ? 'tab-button-active' : ''}`}
        aria-selected={board.activeTab === 'add'}
        onClick={() => board.setActiveTab('add')}
      >
        Add TODO
      </button>
      <button
        type="button"
        role="tab"
        className={`tab-button ${board.activeTab === 'list' ? 'tab-button-active' : ''}`}
        aria-selected={board.activeTab === 'list'}
        onClick={() => board.setActiveTab('list')}
      >
        See TODOs
      </button>
      <button
        type="button"
        role="tab"
        className={`tab-button ${board.activeTab === 'debug' ? 'tab-button-active' : ''}`}
        aria-selected={board.activeTab === 'debug'}
        onClick={() => board.setActiveTab('debug')}
      >
        Debug
      </button>
    </div>
  );
}
