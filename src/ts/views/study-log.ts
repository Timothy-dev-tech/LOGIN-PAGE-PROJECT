import {
  ApiError,
  createStudyLog,
  deleteStudyLog,
  listStudyLogs,
  updateStudyLog,
  type StudyLogEntry,
} from '../api';
import { el } from '../el';
import { formatDay, formatMinutes, todayLocal } from '../format';
import { applyResult, clearFormError, setBusy, showError, showFormError, watchField } from '../form-ui';
import { tidy, validateDay, validateMinutes, validateNotes, validateTopic } from '../study-validators';
import { handleViewError, loadMoreButton, messageBox, viewHeader } from './shared';

const PAGE_SIZE = 20;

function field(label: string, id: string, input: HTMLInputElement, extraClass = ''): { box: HTMLElement; error: HTMLElement } {
  const error = el('span', { id: `${id}Error`, class: 'error-message', 'aria-live': 'polite' });
  input.id = id;
  input.setAttribute('aria-describedby', `${id}Error`);
  return { box: el('div', { class: `field ${extraClass}`.trim() }, el('label', { for: id }, label), input, error), error };
}

export async function renderStudyLog(root: HTMLElement): Promise<void> {
  let items: StudyLogEntry[] = [];
  let total = 0;
  let editing: StudyLogEntry | null = null;

  // ---- the form ----
  const topic = el('input', { type: 'text', name: 'topic', autocomplete: 'off', placeholder: 'e.g. Express middleware' });
  const minutes = el('input', { type: 'text', name: 'minutes', inputmode: 'numeric', autocomplete: 'off', placeholder: 'e.g. 45' });
  const day = el('input', { type: 'date', name: 'studiedOn', max: todayLocal(), value: todayLocal() });
  const notes = el('input', { type: 'text', name: 'notes', autocomplete: 'off', placeholder: 'Optional: what clicked, what did not' });
  const topicField = field('Topic', 'logTopic', topic, 'field--topic');
  const minutesField = field('Minutes', 'logMinutes', minutes);
  const dayField = field('Day', 'logDay', day);
  const notesField = field('Notes (optional)', 'logNotes', notes, 'field--wide');

  const formTitle = el('h2', { id: 'formTitle', class: 'section-title' }, 'Add an entry');
  const formError = el('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = el('button', { type: 'submit', class: 'btn' }, 'Add entry');
  const cancel = el('button', { type: 'button', class: 'btn btn--quiet', hidden: true, onclick: () => resetForm() }, 'Cancel');
  const form = el(
    'form',
    { class: 'entry-form', novalidate: true },
    topicField.box,
    minutesField.box,
    dayField.box,
    notesField.box,
    el('div', { class: 'form-actions' }, submit, cancel),
    formError,
  );

  watchField(topic, topicField.error, () => validateTopic(topic.value));
  watchField(minutes, minutesField.error, () => validateMinutes(minutes.value));
  watchField(day, dayField.error, () => validateDay(day.value, todayLocal()));
  watchField(notes, notesField.error, () => validateNotes(notes.value));

  function resetForm(): void {
    editing = null;
    topic.value = '';
    minutes.value = '';
    day.value = todayLocal();
    notes.value = '';
    for (const [input, box] of [[topic, topicField], [minutes, minutesField], [day, dayField], [notes, notesField]] as const) {
      applyResult(input, box.error, { valid: true });
    }
    clearFormError(formError);
    formTitle.textContent = 'Add an entry';
    submit.textContent = 'Add entry';
    cancel.hidden = true;
  }

  function startEdit(entry: StudyLogEntry): void {
    editing = entry;
    topic.value = entry.topic;
    minutes.value = String(entry.minutes);
    day.value = entry.studiedOn;
    notes.value = entry.notes;
    clearFormError(formError);
    formTitle.textContent = 'Edit entry';
    submit.textContent = 'Save changes';
    cancel.hidden = false;
    form.scrollIntoView({ block: 'nearest' });
    topic.focus();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFormError(formError);
    const checks = [
      applyResult(topic, topicField.error, validateTopic(topic.value)),
      applyResult(minutes, minutesField.error, validateMinutes(minutes.value)),
      applyResult(day, dayField.error, validateDay(day.value, todayLocal())),
      applyResult(notes, notesField.error, validateNotes(notes.value)),
    ];
    const firstBad = [topic, minutes, day, notes].find((_, i) => !checks[i]);
    if (firstBad) {
      firstBad.focus();
      return;
    }

    const input = { topic: tidy(topic.value), minutes: Number(minutes.value.trim()), studiedOn: day.value, notes: notes.value.trim() };
    setBusy(submit, true, 'Saving…');
    try {
      const wasEditing = editing !== null;
      if (editing) await updateStudyLog(editing.id, input);
      else await createStudyLog(input);
      resetForm();
      await reload();
      announce(wasEditing ? 'Entry saved.' : 'Entry added.');
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        // The server found something the browser rules missed: show it on the right field.
        const targets = { topic: [topic, topicField], minutes: [minutes, minutesField], studiedOn: [day, dayField], notes: [notes, notesField] } as const;
        for (const [name, message] of Object.entries(error.fieldErrors)) {
          const target = targets[name as keyof typeof targets];
          if (target) showError(target[0], target[1].error, message);
        }
      } else {
        handleViewError(error, (message) => showFormError(formError, message));
      }
    } finally {
      setBusy(submit, false, '');
    }
  });

  // ---- the list ----
  const status = el('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const list = el('ul', { class: 'entries' });
  const listFooter = el('div', { class: 'list-footer' });
  const listArea = el('div', { class: 'list-area' }, list, listFooter);

  function announce(message: string): void {
    status.textContent = message;
  }

  function entryRow(entry: StudyLogEntry): HTMLElement {
    let armed: number | undefined;
    const deleteButton = el('button', { type: 'button', class: 'btn btn--quiet btn--danger' }, 'Delete');
    const disarm = () => {
      window.clearTimeout(armed);
      armed = undefined;
      deleteButton.textContent = 'Delete';
    };
    deleteButton.addEventListener('click', async () => {
      if (armed === undefined) {
        // First click only asks. A second click within 4 seconds does it.
        deleteButton.textContent = 'Confirm delete';
        armed = window.setTimeout(disarm, 4000);
        return;
      }
      disarm();
      deleteButton.disabled = true;
      try {
        await deleteStudyLog(entry.id);
        if (editing?.id === entry.id) resetForm();
        await reload();
        announce('Entry deleted.');
      } catch (error) {
        deleteButton.disabled = false;
        handleViewError(error, announce);
      }
    });
    deleteButton.addEventListener('blur', disarm);

    return el(
      'li',
      { class: 'entry' },
      el(
        'div',
        { class: 'entry-main' },
        el('h3', {}, entry.topic),
        el('p', { class: 'entry-meta' }, `${formatDay(entry.studiedOn)} · ${formatMinutes(entry.minutes)}`),
        entry.notes ? el('p', { class: 'entry-notes' }, entry.notes) : null,
      ),
      el(
        'div',
        { class: 'entry-actions' },
        el('button', { type: 'button', class: 'btn btn--quiet', 'aria-label': `Edit ${entry.topic}`, onclick: () => startEdit(entry) }, 'Edit'),
        deleteButton,
      ),
    );
  }

  function renderList(): void {
    list.replaceChildren(...items.map(entryRow));
    listFooter.replaceChildren();
    if (items.length === 0) {
      listFooter.append(el('p', { class: 'empty' }, 'No entries yet. Add your first one above.'));
      return;
    }
    listFooter.append(el('p', { class: 'count' }, `Showing ${items.length} of ${total}`));
    if (items.length < total) listFooter.append(loadMoreButton(loadMore));
  }

  async function reload(): Promise<void> {
    const result = await listStudyLogs(1, PAGE_SIZE);
    items = result.items;
    total = result.total;
    renderList();
  }

  async function loadMore(): Promise<void> {
    try {
      const result = await listStudyLogs(Math.floor(items.length / PAGE_SIZE) + 1, PAGE_SIZE);
      items = [...items, ...result.items];
      total = result.total;
      renderList();
    } catch (error) {
      handleViewError(error, announce);
    }
  }

  async function firstLoad(): Promise<void> {
    list.replaceChildren(el('li', { class: 'empty' }, 'Loading…'));
    try {
      await reload();
    } catch (error) {
      handleViewError(error, (message) => listArea.replaceChildren(messageBox(message, () => void firstLoad())));
    }
  }

  root.append(
    ...viewHeader('Study log', 'What you studied and for how long. Only you can see these entries.'),
    el('section', { class: 'card-block', 'aria-labelledby': 'formTitle' }, formTitle, form),
    status,
    listArea,
  );
  await firstLoad();
}