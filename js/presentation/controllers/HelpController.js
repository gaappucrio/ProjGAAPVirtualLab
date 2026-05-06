export function setupHelpController() {
    const trigger = document.getElementById('btn-help');
    const modal = document.getElementById('help-modal');
    const closeButton = document.getElementById('btn-help-close');
    const closeTargets = modal?.querySelectorAll('[data-help-close]') || [];

    if (!trigger || !modal) return;

    function openHelp() {
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        closeButton?.focus();
    }

    function closeHelp() {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        trigger.focus();
    }

    trigger.addEventListener('click', openHelp);
    closeButton?.addEventListener('click', closeHelp);
    closeTargets.forEach((target) => target.addEventListener('click', closeHelp));

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !modal.classList.contains('is-open')) return;
        closeHelp();
    });
}
