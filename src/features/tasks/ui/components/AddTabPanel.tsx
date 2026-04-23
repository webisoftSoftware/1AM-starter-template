import type { Priority } from '../../types';
import type { TaskBoardViewModel } from '../types';

type AddTabPanelProps = {
  board: TaskBoardViewModel;
};

export function AddTabPanel({ board }: AddTabPanelProps) {
  return (
    <div className="tab-pane tab-pane-scroll" role="tabpanel" aria-label="Add TODO tab">
      <div className="actions-toolbar">
        <div className="actions">
          <button type="button" className="button-primary" onClick={board.deployTaskContract} disabled={!board.canDeploy}>
            {board.busyAction === 'deploy' ? 'Deploying...' : `Deploy ${board.isShieldedMode ? 'Shielded' : 'Unshielded'} Contract`}
          </button>

          <button type="button" className="button-secondary" onClick={board.refreshCurrentTasks} disabled={!board.canRefresh}>
            {board.busyAction === 'refresh' ? 'Refreshing...' : 'Refresh On-Chain Tasks'}
          </button>

          <button type="button" className="button-primary" onClick={board.queueTaskSave} disabled={!board.canSave}>
            {board.busyAction === 'submit' ? 'Saving...' : `Save ${board.isShieldedMode ? 'Shielded' : 'Unshielded'} Changes On-Chain`}
          </button>
        </div>

        <div className="action-toggles" role="group" aria-label="Posting options">
          <label className="toggle-control">
            <input
              className="toggle-input"
              type="checkbox"
              checked={board.privacyMode === 'shielded'}
              disabled={board.busyAction !== null}
              onChange={(event) => board.setPrivacyMode(event.target.checked ? 'shielded' : 'unshielded')}
            />
            <span className="toggle-track" aria-hidden="true">
              <span className="toggle-thumb" />
            </span>
            <span className="toggle-text">Shielded contract</span>
          </label>

          <label className="toggle-control">
            <input
              className="toggle-input"
              type="checkbox"
              checked={board.confidentialMode}
              disabled={board.busyAction !== null || !board.session}
              onChange={(event) => board.setConfidentialMode(event.target.checked)}
            />
            <span className="toggle-track" aria-hidden="true">
              <span className="toggle-thumb" />
            </span>
            <span className="toggle-text">Encrypt payload</span>
          </label>
        </div>
      </div>

      {board.session && (
        <dl className="details">
          <div>
            <dt>Network</dt>
            <dd>{board.session.config.networkId}</dd>
          </div>
          <div>
            <dt>Indexer</dt>
            <dd>{board.session.config.indexerUri}</dd>
          </div>
          <div>
            <dt>Unshielded address</dt>
            <dd>{board.session.unshieldedAddress}</dd>
          </div>
          <div>
            <dt>Posting mode</dt>
            <dd>{board.isShieldedMode ? 'Shielded contract' : 'Unshielded contract'}</dd>
          </div>
          <div>
            <dt>Payload confidentiality</dt>
            <dd>{board.confidentialMode ? 'Encrypted (wallet-signature key)' : 'Plaintext'}</dd>
          </div>
        </dl>
      )}

      <div className="stack">
        <div className="field contract-address-row">
          <label htmlFor="contract-address">Contract address ({board.isShieldedMode ? 'shielded' : 'unshielded'})</label>
          <input id="contract-address" value={board.contractAddress || 'Not deployed yet'} title={board.contractAddress || 'Not deployed yet'} readOnly />
        </div>

        <div className="inline-actions">
          <button type="button" onClick={board.clearSavedContract} disabled={!board.contractAddress || board.busyAction !== null}>
            Forget Saved Contract
          </button>
          <button type="button" onClick={board.resetTaskForm} disabled={board.busyAction !== null || !board.editingTaskId}>
            Cancel Edit
          </button>
        </div>

        <section className="composer composer-compact">
          <div className="composer-header">
            <h2>{board.editingTaskId ? 'Edit Task' : 'Add Task'}</h2>
            <p>{board.editingTaskId ? 'Update the task locally, then save on-chain.' : 'Build your next task locally, then save on-chain.'}</p>
          </div>

          <div className="task-form-grid">
            <div className="field field-wide">
              <label htmlFor="task-title">Title</label>
              <input
                id="task-title"
                value={board.taskForm.title}
                onChange={(event) => board.setTaskForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Ship task editing on Midnight"
                disabled={!board.canEditTasks}
              />
            </div>

            <div className="field">
              <label htmlFor="task-due-date">Due date</label>
              <input
                id="task-due-date"
                type="date"
                value={board.taskForm.dueDate}
                onChange={(event) => board.setTaskForm((current) => ({ ...current, dueDate: event.target.value }))}
                disabled={!board.canEditTasks}
              />
            </div>

            <div className="field">
              <label htmlFor="task-priority">Priority</label>
              <select
                id="task-priority"
                value={board.taskForm.priority}
                onChange={(event) => board.setTaskForm((current) => ({ ...current, priority: event.target.value as Priority }))}
                disabled={!board.canEditTasks}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="task-category">Category</label>
              <input
                id="task-category"
                value={board.taskForm.category}
                onChange={(event) => board.setTaskForm((current) => ({ ...current, category: event.target.value }))}
                placeholder="Product"
                disabled={!board.canEditTasks}
              />
            </div>

            <div className="field field-wide">
              <label htmlFor="task-tags">Tags</label>
              <input
                id="task-tags"
                value={board.taskForm.tags}
                onChange={(event) => board.setTaskForm((current) => ({ ...current, tags: event.target.value }))}
                placeholder="wallet, proofstation, midnight"
                disabled={!board.canEditTasks}
              />
            </div>
          </div>

          <div className="inline-actions">
            <button type="button" onClick={board.upsertTask} disabled={!board.canEditTasks}>
              {board.editingTaskId ? 'Update Task Locally' : 'Add Task Locally'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
