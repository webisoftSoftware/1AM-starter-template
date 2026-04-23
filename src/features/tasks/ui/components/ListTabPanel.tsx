import { toTaskSyncKey } from '../../domain/taskPayload';
import type { Priority, StatusFilter } from '../../types';
import type { TaskBoardViewModel } from '../types';

type ListTabPanelProps = {
  board: TaskBoardViewModel;
};

export function ListTabPanel({ board }: ListTabPanelProps) {
  return (
    <div className="tab-pane tab-pane-scroll" role="tabpanel" aria-label="See TODOs tab">
      <dl className="details details-secondary summary-grid">
        <div>
          <dt>Total tasks</dt>
          <dd>{board.tasks.length}</dd>
        </div>
        <div>
          <dt>Pending</dt>
          <dd>{board.pendingCount}</dd>
        </div>
        <div>
          <dt>Completed</dt>
          <dd>{board.completedCount}</dd>
        </div>
        <div>
          <dt>Unsaved changes</dt>
          <dd>{board.hasUnsavedChanges ? 'Yes' : 'No'}</dd>
        </div>
        <div>
          <dt>Last transaction id</dt>
          <dd>{board.lastTxId || 'No transaction submitted yet.'}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{board.feedback}</dd>
        </div>
      </dl>

      <section className="chain-sync-panel">
        <p>Task edits are local first. Click save to commit local changes to the blockchain.</p>
        <div className="inline-actions chain-sync-actions">
          <button type="button" className="button-secondary" onClick={board.refreshCurrentTasks} disabled={!board.canRefresh}>
            {board.busyAction === 'refresh' ? 'Refreshing...' : 'Refresh On-Chain Tasks'}
          </button>
          <button type="button" className="button-primary" onClick={board.queueTaskSave} disabled={!board.canSave}>
            {board.busyAction === 'submit' ? 'Saving...' : `Save ${board.isShieldedMode ? 'Shielded' : 'Unshielded'} Changes On-Chain`}
          </button>
        </div>
      </section>

      <section className="filters">
        <div className="filter-grid">
          <div className="field">
            <label htmlFor="filter-status">Status</label>
            <select id="filter-status" value={board.statusFilter} onChange={(event) => board.setStatusFilter(event.target.value as StatusFilter)}>
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="filter-priority">Priority</label>
            <select
              id="filter-priority"
              value={board.priorityFilter}
              onChange={(event) => board.setPriorityFilter(event.target.value as 'all' | Priority)}
            >
              <option value="all">All</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="filter-category">Category</label>
            <select id="filter-category" value={board.categoryFilter} onChange={(event) => board.setCategoryFilter(event.target.value)}>
              <option value="all">All</option>
              {board.categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="task-list-panel">
        <div className="task-list-header">
          <h2>Tasks</h2>
          <p>
            {board.filteredTasks.length} visible of {board.tasks.length} total
          </p>
        </div>

        {board.filteredTasks.length === 0 ? (
          <p className="empty-state">No tasks match the current filters.</p>
        ) : (
          <div className="task-list">
            {board.filteredTasks.map((task) => (
              <article
                className={`task-card ${board.syncedTaskKeys.has(toTaskSyncKey(task)) ? 'task-card-synced' : 'task-card-local'} ${task.completed ? 'task-card-completed' : ''}`}
                key={task.id}
              >
                <div className="task-main">
                  <div className="task-title-row">
                    <h3>{task.title}</h3>
                    <span className={`priority-chip priority-${task.priority}`}>{task.priority}</span>
                  </div>

                  <div className="meta-row">
                    <span>{task.completed ? 'Completed' : 'Pending'}</span>
                    <span>{task.category ?? 'No category'}</span>
                    <span>{task.dueDate ? `Due ${task.dueDate}` : 'No due date'}</span>
                  </div>

                  <div className="tag-row">
                    {task.tags.length === 0 ? (
                      <span className="tag-chip tag-chip-empty">No tags</span>
                    ) : (
                      task.tags.map((tag) => (
                        <span className="tag-chip" key={`${task.id}-${tag}`}>
                          {tag}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div className="task-actions">
                  <button type="button" onClick={() => board.toggleTaskCompletion(task.id)} disabled={board.busyAction !== null}>
                    Mark {task.completed ? 'Incomplete' : 'Complete'} Locally
                  </button>
                  <button type="button" onClick={() => board.startEditingTask(task)} disabled={board.busyAction !== null}>
                    Edit Task Locally
                  </button>
                  <button type="button" onClick={() => board.deleteTask(task.id)} disabled={board.busyAction !== null}>
                    Delete Task Locally
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
