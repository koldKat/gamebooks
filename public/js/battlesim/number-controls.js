// Give simulator number fields shared steppers without replacing their inputs or handlers.
export function prepareSimulatorNumbers(modal) {
  const document = modal.ownerDocument;
  for (const input of modal.querySelectorAll('input[type="number"], input[inputmode="numeric"], input[inputmode="decimal"]')) {
    // Legacy panels already supply steppers with book-specific stat limits.
    if (input.closest('.inv-qty-wrap') && !input.closest('.bsim-number-control')) continue;
    let wrapper = input.closest('.bsim-number-control');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'inv-qty-wrap bsim-number-control';
      input.before(wrapper);
      wrapper.append(input);
      for (const delta of [-1, 1]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'inv-qty-btn';
        button.textContent = delta < 0 ? '−' : '+';
        button.setAttribute('aria-label', button.textContent);
        button.addEventListener('click', event => {
          event.preventDefault();
          // Panels may delegate their legacy stepper clicks. Only the original
          // input/change handlers should process a shared stepper adjustment.
          event.stopImmediatePropagation();
          if (input.matches(':disabled') || input.readOnly) return;
          const before = input.value;
          if (input.type === 'number') {
            // Native stepping honors min/max, decimals and the field's step base.
            if (input.step === 'any') {
              input.value = String(Math.min(Number(input.max || Infinity),
                Math.max(input.min === '' ? -Infinity : Number(input.min), (Number(input.value) || 0) + delta)));
            } else if (delta < 0) input.stepDown();
            else input.stepUp();
          } else {
            const step = Number(input.getAttribute('step')) || 1;
            const min = input.hasAttribute('min') ? Number(input.getAttribute('min')) : 0;
            const max = input.hasAttribute('max') ? Number(input.getAttribute('max')) : Infinity;
            input.value = String(Math.min(max, Math.max(min, (Number(input.value) || 0) + delta * step)));
          }
          if (input.value === before) return;
          const Event = document.defaultView.Event;
          input.dispatchEvent(new Event('input', {bubbles: true}));
          input.dispatchEvent(new Event('change', {bubbles: true}));
        }, true);
        if (delta < 0) wrapper.prepend(button);
        else wrapper.append(button);
      }
      input.classList.add('inv-qty-input');
    }
    const disabled = input.matches(':disabled') || input.readOnly;
    for (const button of wrapper.querySelectorAll(':scope > button')) {
      if (button.disabled !== disabled) button.disabled = disabled;
    }
  }
}
