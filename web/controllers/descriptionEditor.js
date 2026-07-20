export function createDescriptionEditor({ persist, renderAll }) {
  function handleTab(event, textarea) {
    if (event.key !== 'Tab' && event.key !== 'Enter') return false;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEndIndex = value.indexOf('\n', start);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
    const line = value.slice(lineStart, lineEnd);
    const bulletMatch = line.match(/^(\s*)(?:\u2022|-)\s(.*)$/);

    if (event.key === 'Enter') {
      if (!bulletMatch) return false;
      event.preventDefault();
      const indent = bulletMatch[1];
      const content = bulletMatch[2].trim();
      if (!content) {
        const removeEnd = lineStart + bulletMatch[0].length;
        textarea.value = value.slice(0, lineStart) + value.slice(removeEnd);
        textarea.selectionStart = textarea.selectionEnd = lineStart;
      } else {
        const token = `\n${indent}\u2022 `;
        textarea.value = value.slice(0, start) + token + value.slice(end);
        textarea.selectionStart = textarea.selectionEnd = start + token.length;
      }
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }

    event.preventDefault();
    if (event.shiftKey) {
      if (!bulletMatch) return true;
      const indent = bulletMatch[1];
      const content = bulletMatch[2];
      if (indent.length <= 2) {
        textarea.value = value.slice(0, lineStart) + content + value.slice(lineEnd);
        textarea.selectionStart = textarea.selectionEnd = Math.max(lineStart, start - (line.length - content.length));
      } else {
        textarea.value = value.slice(0, lineStart) + value.slice(lineStart + 2);
        textarea.selectionStart = Math.max(lineStart, start - 2);
        textarea.selectionEnd = Math.max(textarea.selectionStart, end - 2);
      }
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }

    if (bulletMatch) {
      textarea.value = value.slice(0, lineStart) + '  ' + value.slice(lineStart);
      textarea.selectionStart = textarea.selectionEnd = start + 2;
    } else {
      const token = line.trim().length ? '  ' : '  \u2022 ';
      textarea.value = value.slice(0, start) + token + value.slice(end);
      textarea.selectionStart = textarea.selectionEnd = start + token.length;
    }
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  function applyHeight(task, textarea, options = {}) {
    textarea.style.height = 'auto';
    if (!textarea.value.trim()) {
      task.descriptionHeight = 0;
      textarea.style.height = '34px';
      return;
    }
    const savedHeight = options.useSavedHeight ? Number(task.descriptionHeight || 0) : 0;
    textarea.style.height = `${Math.max(textarea.scrollHeight, savedHeight, 34)}px`;
  }

  function rememberHeight(task, textarea) {
    task.descriptionHeight = textarea.value.trim()
      ? Math.max(textarea.offsetHeight, textarea.scrollHeight, 34)
      : 0;
  }

  async function commit(task, value, textarea = null) {
    const description = value.trim();
    const nextHeight = description && textarea ? Math.max(textarea.offsetHeight, textarea.scrollHeight, 34) : 0;
    if ((task.description || '') === description && Number(task.descriptionHeight || 0) === nextHeight) return;
    task.description = description;
    task.descriptionHeight = nextHeight;
    task.updatedAt = new Date().toISOString();
    await persist();
    renderAll();
  }

  function renderDescriptionInput(task, className) {
    const textarea = document.createElement('textarea');
    textarea.className = className;
    textarea.placeholder = 'description';
    textarea.value = task.description || '';
    textarea.spellcheck = false;
    if (textarea.classList.contains('terminal-description')) {
      requestAnimationFrame(() => applyHeight(task, textarea, { useSavedHeight: true }));
      textarea.addEventListener('input', () => applyHeight(task, textarea));
      textarea.addEventListener('mouseup', () => rememberHeight(task, textarea));
    }
    textarea.addEventListener('keydown', (event) => {
      if (handleTab(event, textarea)) return;
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        textarea.blur();
      }
    });
    textarea.addEventListener('blur', () => commit(task, textarea.value, textarea));
    return textarea;
  }

  return { renderDescriptionInput };
}
