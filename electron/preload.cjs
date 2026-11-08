const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('load-data'),
  pickExcelFiles: () => ipcRenderer.invoke('pick-excel-files'),
  importFiles: (items) => ipcRenderer.invoke('import-files', items),
  updateOffice: (office, patch) => ipcRenderer.invoke('update-office', office, patch),
  saveHoliday: (holiday, originalDate) => ipcRenderer.invoke('save-holiday', holiday, originalDate),
  deleteHoliday: (date) => ipcRenderer.invoke('delete-holiday', date),
  adjustDay: (day) => ipcRenderer.invoke('adjust-day', day),
  revertDay: (day) => ipcRenderer.invoke('revert-day', day),
  print: () => ipcRenderer.invoke('print'),
  exportPdf: (suggestedName) => ipcRenderer.invoke('export-pdf', suggestedName),
});
