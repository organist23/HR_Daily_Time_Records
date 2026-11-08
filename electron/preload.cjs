const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('load-data'),
  pickExcelFiles: () => ipcRenderer.invoke('pick-excel-files'),
  importFiles: (items) => ipcRenderer.invoke('import-files', items),
  updateOffice: (office, patch) => ipcRenderer.invoke('update-office', office, patch),
  print: () => ipcRenderer.invoke('print'),
  exportPdf: (suggestedName) => ipcRenderer.invoke('export-pdf', suggestedName),
});
