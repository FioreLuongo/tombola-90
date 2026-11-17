import { ONLINE_GUIDE_PDF_BASE64 } from './guide-pdf-data';
import { APPWRITE_GUIDE_PDF_BASE64 } from './appwrite-guide-pdf-data';

/**
 * Gestore Ufficiale della Guida Messa Online e Download PDF/ZIP
 * Bypassa qualsiasi restrizione di sandbox e iframe scaricando i file direttamente
 * in memoria come Blob binari nativi (100% conformi ad Adobe Acrobat Reader e OS).
 */

function showToastNotification(title: string, message: string, icon = 'fas fa-check-circle', color = '#10b981') {
  let toast = document.getElementById('onlineGuideToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'onlineGuideToast';
    toast.style.position = 'fixed';
    toast.style.bottom = '24px';
    toast.style.right = '24px';
    toast.style.zIndex = '999999';
    toast.style.background = 'linear-gradient(135deg, #0d1738 0%, #172554 100%)';
    toast.style.border = '1.5px solid #d4af37';
    toast.style.borderRadius = '10px';
    toast.style.padding = '14px 18px';
    toast.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.7), 0 0 15px rgba(212, 175, 55, 0.3)';
    toast.style.color = '#ffffff';
    toast.style.maxWidth = '420px';
    toast.style.fontFamily = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    toast.style.display = 'flex';
    toast.style.alignItems = 'flex-start';
    toast.style.gap = '12px';
    toast.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    toast.style.transform = 'translateY(100px)';
    toast.style.opacity = '0';
    document.body.appendChild(toast);
  }

  toast.innerHTML = `
    <div style="font-size: 24px; color: ${color}; flex-shrink: 0; margin-top: 2px;">
      <i class="${icon}"></i>
    </div>
    <div style="flex-grow: 1;">
      <div style="font-size: 13px; font-weight: 800; color: #f8fafc; margin-bottom: 3px; display: flex; align-items: center; justify-content: space-between;">
        <span>${title}</span>
        <button id="closeGuideToastBtn" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 14px; padding: 0 4px;">&times;</button>
      </div>
      <div style="font-size: 11.5px; line-height: 1.45; color: #cbd5e1;">${message}</div>
    </div>
  `;

  requestAnimationFrame(() => {
    if (toast) {
      toast.style.transform = 'translateY(0)';
      toast.style.opacity = '1';
    }
  });

  const closeBtn = document.getElementById('closeGuideToastBtn');
  if (closeBtn) {
    closeBtn.onclick = () => {
      if (toast) {
        toast.style.transform = 'translateY(100px)';
        toast.style.opacity = '0';
      }
    };
  }

  setTimeout(() => {
    if (toast && toast.style.opacity === '1') {
      toast.style.transform = 'translateY(100px)';
      toast.style.opacity = '0';
    }
  }, 7000);
}

function triggerBase64PdfDownload(
  base64Data: string,
  fileName: string,
  fallbackPublicPath: string,
  toastMessage: string
) {
  try {
    const cleanBase64 = base64Data.replace(/\s+/g, '');
    const binaryString = window.atob(cleanBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);

    const downloadLink = document.createElement('a');
    downloadLink.href = blobUrl;
    downloadLink.download = fileName;
    downloadLink.rel = 'noopener';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 30000);

    showToastNotification(
      'Download PDF Avviato!',
      toastMessage,
      'fas fa-file-pdf',
      '#38bdf8'
    );
  } catch (error) {
    console.error('Errore generazione Blob PDF:', error);
    const baseUrl = import.meta.env.BASE_URL || '/';
    const fallbackLink = document.createElement('a');
    fallbackLink.href = `${baseUrl}${fallbackPublicPath.replace(/^\/+/, '')}`;
    fallbackLink.download = fileName;
    fallbackLink.target = '_blank';
    fallbackLink.rel = 'noopener';
    document.body.appendChild(fallbackLink);
    fallbackLink.click();
    document.body.removeChild(fallbackLink);
  }
}

/**
 * Scarica la guida in PDF convertendo la costante Base64 in un Blob binario.
 * Non passa per HTTP proxy ed evita qualsiasi danneggiamento del file.
 */
export function downloadOnlineGuidePDF(e?: Event) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  triggerBase64PdfDownload(
    ONLINE_GUIDE_PDF_BASE64,
    'Guida_Messa_Online_GitHub_Hosting.pdf',
    'Guida_Messa_Online_GitHub_Hosting.pdf',
    'Il file <b>Guida_Messa_Online_GitHub_Hosting.pdf</b> è stato generato in formato binario originale (100% integro e compatibile con Adobe Acrobat Reader).'
  );
}

/**
 * Scarica la guida configurazione Appwrite in PDF convertendo la costante Base64 in un Blob binario.
 */
export function downloadAppwriteGuidePDF(e?: Event) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  triggerBase64PdfDownload(
    APPWRITE_GUIDE_PDF_BASE64,
    'Guida_Configurazione_Appwrite_Tombola90.pdf',
    'Guida_Configurazione_Appwrite_Tombola90.pdf',
    'Il file <b>Guida_Configurazione_Appwrite_Tombola90.pdf</b> (3 pagine A4) è pronto ed integro in formato binario PDF classico per Adobe Acrobat Reader.'
  );
}

/**
 * Scarica il pacchetto ZIP completo del progetto.
 */
export async function downloadProjectZip(e?: Event) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  showToastNotification(
    'Preparazione Archivio ZIP...',
    'Download in corso del progetto completo (tutti i file, script e configurazioni di hosting)...',
    'fas fa-spinner fa-spin',
    '#f59e0b'
  );

  const baseUrl = import.meta.env.BASE_URL || '/';
  try {
    let response = await fetch(`${baseUrl}tombola-90-complete.zip`);
    if (!response.ok) {
      response = await fetch(`${baseUrl}luongo-tombola-90-complete.zip`);
    }
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const downloadLink = document.createElement('a');
    downloadLink.href = blobUrl;
    downloadLink.download = 'tombola-90-complete.zip';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 15000);

    showToastNotification(
      'Archivio ZIP Scaricato!',
      'Tutti i file di codice sorgente e di configurazione (render.yaml, firebase.json, _redirects) sono pronti per essere inviati a GitHub sul repository Tombola-90.',
      'fas fa-file-archive',
      '#10b981'
    );
  } catch (error) {
    console.warn('Fallback download ZIP diretto:', error);
    const link = document.createElement('a');
    link.href = `${baseUrl}tombola-90-complete.zip`;
    link.download = 'tombola-90-complete.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/**
 * Apre la modale interattiva di anteprima della guida con supporto alla stampa nativa
 */
export function openOnlineGuideModal(e?: Event) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  const modal = document.getElementById('onlineGuideModal');
  if (modal) {
    modal.style.display = 'flex';
    document.body.classList.add('guide-modal-open');
  }
}

/**
 * Chiude la modale della guida
 */
export function closeOnlineGuideModal(e?: Event) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  const modal = document.getElementById('onlineGuideModal');
  if (modal) {
    modal.style.display = 'none';
    document.body.classList.remove('guide-modal-open');
  }
}

export function openAppwriteGuideModal(e?: Event) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  const modal = document.getElementById('appwriteGuideModal');
  if (modal) {
    modal.style.display = 'flex';
    document.body.classList.add('appwrite-guide-modal-open');
  }
}

export function closeAppwriteGuideModal(e?: Event) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  const modal = document.getElementById('appwriteGuideModal');
  if (modal) {
    modal.style.display = 'none';
    document.body.classList.remove('appwrite-guide-modal-open');
  }
}

/**
 * Avvia la stampa nativa del browser (ottimizzata A4 tramite @media print)
 */
export function printOnlineGuide(e?: Event) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  window.print();
}

/**
 * Inizializza i pulsanti nella pagina Regia
 */
export function initOnlineGuideManager() {
  // Esponi le funzioni su window per compatibilità immediata
  const w = window as any;
  w.downloadOnlineGuidePDF = downloadOnlineGuidePDF;
  w.downloadAppwriteGuidePDF = downloadAppwriteGuidePDF;
  w.downloadProjectZip = downloadProjectZip;
  w.openOnlineGuideModal = openOnlineGuideModal;
  w.closeOnlineGuideModal = closeOnlineGuideModal;
  w.openAppwriteGuideModal = openAppwriteGuideModal;
  w.closeAppwriteGuideModal = closeAppwriteGuideModal;
  w.printOnlineGuide = printOnlineGuide;

  // Collega i bottoni nel DOM
  const bindBtn = (id: string, handler: (e: Event) => void) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', handler);
    }
  };

  bindBtn('regiaHeaderDownloadGuidePdfBtn', openOnlineGuideModal);
  bindBtn('regiaHeaderDirectPdfBtn', downloadOnlineGuidePDF);
  bindBtn('regiaDownloadGuidePdfBtn', downloadOnlineGuidePDF);
  bindBtn('regiaOpenGuideModalBtn', openOnlineGuideModal);
  bindBtn('regiaDownloadCodeZipBtn', downloadProjectZip);

  // Bottoni Guida Appwrite (Barra Regia + Dual-DB Modal + Modale Guida Appwrite)
  bindBtn('regiaAppwritePdfBtn', downloadAppwriteGuidePDF);
  bindBtn('downloadAppwritePdfBtn', downloadAppwriteGuidePDF);
  bindBtn('openAppwriteGuideModalBtn', openAppwriteGuideModal);
  bindBtn('closeAppwriteGuideModalBtn', closeAppwriteGuideModal);
  bindBtn('appwriteModalCloseHeaderBtn', closeAppwriteGuideModal);
  bindBtn('appwriteModalDownloadPdfBtn', downloadAppwriteGuidePDF);
  bindBtn('appwriteModalDownloadFooterBtn', downloadAppwriteGuidePDF);
  bindBtn('appwriteModalPrintGuideBtn', printOnlineGuide);
  bindBtn('appwriteModalPrintFooterBtn', printOnlineGuide);

  // Bottoni all'interno della modale
  bindBtn('closeOnlineGuideModalBtn', closeOnlineGuideModal);
  bindBtn('modalCloseHeaderBtn', closeOnlineGuideModal);
  bindBtn('modalDownloadPdfBtn', downloadOnlineGuidePDF);
  bindBtn('modalDownloadFooterBtn', downloadOnlineGuidePDF);
  bindBtn('modalPrintGuideBtn', printOnlineGuide);
  bindBtn('modalPrintFooterBtn', printOnlineGuide);
  bindBtn('modalDownloadZipBtn', downloadProjectZip);

  // Chiudi cliccando fuori dalla finestra modale
  const modal = document.getElementById('onlineGuideModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeOnlineGuideModal();
      }
    });
  }

  const appwriteModal = document.getElementById('appwriteGuideModal');
  if (appwriteModal) {
    appwriteModal.addEventListener('click', (e) => {
      if (e.target === appwriteModal) {
        closeAppwriteGuideModal();
      }
    });
  }

  // Supporto tasto Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const awModal = document.getElementById('appwriteGuideModal');
      if (awModal && awModal.style.display !== 'none') {
        closeAppwriteGuideModal();
        return;
      }
      const m = document.getElementById('onlineGuideModal');
      if (m && m.style.display !== 'none') {
        closeOnlineGuideModal();
      }
    }
  });
}

// Inizializza al caricamento DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOnlineGuideManager);
} else {
  initOnlineGuideManager();
}
