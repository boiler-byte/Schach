/* Installationshilfe und Service-Worker-Updates; Spiel-Engine bleibt unabhängig. */
(() => {
  'use strict';
  const installButton = document.getElementById('installButton');
  const installDialog = document.getElementById('iosInstallDialog');
  const installInstructions = document.getElementById('iosInstallInstructions');
  const updateBanner = document.getElementById('pwaUpdateBanner');
  const updateButton = document.getElementById('pwaUpdateButton');
  let deferredPrompt = null;
  let refreshing = false;
  let serviceWorkerRegistration = null;
  let hadController = Boolean(navigator.serviceWorker && navigator.serviceWorker.controller);

  const standalone = () => window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/i.test(navigator.userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(navigator.userAgent);

  function showInstallOption() {
    installButton.classList.toggle('hidden', standalone() || (!deferredPrompt && !iOS));
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    showInstallOption();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    showInstallOption();
  });

  installButton.addEventListener('click', async () => {
    if (deferredPrompt) {
      const prompt = deferredPrompt;
      deferredPrompt = null;
      showInstallOption();
      try {
        await prompt.prompt();
        await prompt.userChoice;
      } catch (error) {
        console.warn('Installationsdialog konnte nicht geöffnet werden:', error);
      }
    } else if (iOS && typeof installDialog.showModal === 'function') {
      installInstructions.innerHTML = isSafari
        ? 'Tippe in Safari auf <strong>Teilen</strong> und dann auf <strong>Zum Home-Bildschirm</strong>.'
        : 'Öffne diese Seite in <strong>Safari</strong>. Tippe auf <strong>Teilen</strong> und dann auf <strong>Zum Home-Bildschirm</strong>.';
      installDialog.showModal();
    }
  });

  showInstallOption();
  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', showInstallOption);

  function offerUpdate() {
    if (serviceWorkerRegistration && navigator.serviceWorker.controller) {
      updateBanner.classList.remove('hidden');
    }
  }

  updateButton.addEventListener('click', () => {
    if (serviceWorkerRegistration && serviceWorkerRegistration.waiting) {
      serviceWorkerRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  });

  // Unter file:// funktionieren Service Worker nicht: Die App braucht HTTPS/localhost.
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Bei der Erstinstallation die laufende Partie nicht neu laden.
    if (!hadController) { hadController = true; return; }
    if (!refreshing) {
      refreshing = true;
      location.reload();
    }
  });

  window.addEventListener('load', async () => {
    try {
      serviceWorkerRegistration = await navigator.serviceWorker.register('./sw.js');
      if (serviceWorkerRegistration.waiting) offerUpdate();
      serviceWorkerRegistration.addEventListener('updatefound', () => {
        const worker = serviceWorkerRegistration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed') offerUpdate();
        });
      });
      // Versionsprüfung bei erneutem Öffnen/Zurückkehren aus dem Hintergrund.
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) serviceWorkerRegistration.update().catch(() => {});
      });
    } catch (error) {
      console.warn('Offline-Installation nicht verfügbar:', error);
    }
  });
})();
